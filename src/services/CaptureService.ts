import { and, gte, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { usageEvents } from '../lib/db/schema';
import { env } from '../lib/env';
import { transcribe } from './TranscriptionService';
import { extract, type ExtractedContact } from './ExtractionService';
import { getProfile } from './UserProfileService';
import { createContact, addInteraction, findByNameAndCompany } from './ContactService';
import { renderCard, buildCaption } from './CardService';
import { sendMessage, sendPhoto } from '../lib/telegram/send';
import { uploadPhoto } from '../lib/r2/client';

type CaptureInput = {
  userId: number;
  chatId: number;
  fileId: string;
  mimeType: string;
  kind: 'voice' | 'audio' | 'video';
};

async function capturesInLast24h(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, 'capture'), gte(usageEvents.occurredAt, since)));
  return rows[0]?.count ?? 0;
}

async function downloadTelegramFile(fileId: string): Promise<Uint8Array> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const meta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)
    .then((r) => r.json() as Promise<{ ok: boolean; result: { file_path: string } }>);
  if (!meta.ok) throw new Error('Telegram getFile failed');
  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  return new Uint8Array(await fileRes.arrayBuffer());
}

async function ensureContact(userId: number, c: ExtractedContact) {
  const existing = await findByNameAndCompany(userId, c.name, c.company);
  if (existing) return existing;
  return createContact({
    userId,
    name: c.name,
    role: c.role,
    company: c.company,
    emails: c.emails,
    links: c.links,
  });
}

export async function processCapture(input: CaptureInput): Promise<void> {
  const count = await capturesInLast24h(input.userId);
  if (count >= env().MAX_CAPTURES_PER_DAY) {
    await sendMessage({ chatId: input.chatId }, `Daily limit hit (${env().MAX_CAPTURES_PER_DAY} captures). Try again tomorrow.`);
    return;
  }

  const profile = await getProfile(input.userId);
  if (!profile) {
    await sendMessage({ chatId: input.chatId }, "Your profile isn't set up yet. Run /start first.");
    return;
  }

  await db().insert(usageEvents).values({ userId: input.userId, kind: 'capture' });

  const audio = await downloadTelegramFile(input.fileId);
  const transcript = await transcribe(audio);

  if (!transcript.trim()) {
    await sendMessage({ chatId: input.chatId }, "Couldn't make out clear contact info. Try again or type it manually?");
    return;
  }

  const extraction = await extract({ transcript, selfIntro: profile.selfIntro });

  if (extraction.contacts.length === 0) {
    await sendMessage({ chatId: input.chatId }, "Got the notes but couldn't pin down a name. What should I call them?");
    return;
  }

  for (const c of extraction.contacts) {
    const contact = await ensureContact(input.userId, c);

    const png = await renderCard({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        photoR2Url: profile.photoR2Url,
        socials: profile.socials,
      },
      contactName: c.name,
      recap: c.recap,
    });

    const caption = buildCaption({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        socials: profile.socials,
      },
      contactName: c.name,
      recap: c.recap,
    });

    // First send the photo so we can capture Telegram's file_id, then persist the
    // interaction with the file_id + handle so the inline handler can reuse it.
    // The send button is wired with a placeholder query at first; we re-send below
    // once we have the interaction id.
    const handle = c.links.telegram?.replace(/^@/, '');
    const { photoFileId } = await sendPhoto({ chatId: input.chatId }, png, caption);

    const interactionId = await addInteraction(contact.id, input.kind, {
      ...c,
      was_live_recording: extraction.was_live_recording,
      photo_file_id: photoFileId,
    });

    await uploadPhoto({
      key: `cards/${interactionId}.png`,
      bytes: new Uint8Array(png),
      contentType: 'image/png',
    });

    // Now follow-up with a message that carries the "Send to" button bound to the
    // interaction id we just created.
    const sendButton = {
      text: handle ? `📨 Send to @${handle}` : '📨 Send to someone',
      switch_inline_query_chosen_chat: { query: interactionId, allow_user_chats: true },
    };
    const fixButton = {
      text: handle ? `✏️ Wrong handle? Fix @${handle}` : `✏️ Add Telegram handle for ${c.name}`,
      callback_data: `fix:${interactionId}`,
    };
    const replyMarkup = handle
      ? {
          inline_keyboard: [
            [sendButton],
            [{ text: `Open chat with @${handle}`, url: `https://t.me/${handle}` }],
            [fixButton],
          ],
        }
      : { inline_keyboard: [[sendButton], [fixButton]] };

    await sendMessage(
      { chatId: input.chatId },
      handle ? `Forward this card to @${handle} 👇` : `Forward this card to ${c.name} 👇`,
      { replyMarkup }
    );
  }
}
