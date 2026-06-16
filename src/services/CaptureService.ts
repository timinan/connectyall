import { and, gte, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { usageEvents } from '../lib/db/schema';
import { env } from '../lib/env';
import { transcribe } from './TranscriptionService';
import { extract, type ExtractedContact } from './ExtractionService';
import { getById } from './UserProfileService';
import { createContact, addInteraction, findByNameAndCompany } from './ContactService';
import { markReady, markFailed } from './InteractionService';
import { renderCard, buildCaption } from './CardService';
import { sendMessage, sendPhoto } from '../lib/telegram/send';
import { uploadBytes } from '../lib/r2/client';

type CaptureInput = {
  userId: string;        // users.id uuid
  source: 'telegram-voice' | 'telegram-audio' | 'telegram-video' | 'web';
  audio:
    | { kind: 'telegram-file'; fileId: string; mimeType: string }
    | { kind: 'r2-key'; key: string; mimeType: string };
  preMintedInteractionId?: string;
  replyTo:
    | { surface: 'telegram'; chatId: number }
    | { surface: 'web' };
};

async function capturesInLast24h(userId: string): Promise<number> {
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

async function downloadFromR2(key: string): Promise<Uint8Array> {
  const url = `${env().R2_PUBLIC_URL_BASE}/${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureContact(userId: string, c: ExtractedContact) {
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
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, `Daily limit hit (${env().MAX_CAPTURES_PER_DAY} captures). Try again tomorrow.`);
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  const profile = await getById(input.userId);
  if (!profile) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Your profile isn't set up yet.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  await db().insert(usageEvents).values({ userId: input.userId, kind: 'capture' });

  const audio = input.audio.kind === 'telegram-file'
    ? await downloadTelegramFile(input.audio.fileId)
    : await downloadFromR2(input.audio.key);

  const transcript = await transcribe(audio);

  if (!transcript.trim()) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Couldn't make out clear contact info.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  const extraction = await extract({ transcript, selfIntro: profile.selfIntro });

  if (extraction.contacts.length === 0) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Got the notes but couldn't pin down a name.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  const sourceKind: 'voice' | 'audio' | 'video' | 'manual' =
    input.source === 'telegram-voice' ? 'voice'
    : input.source === 'telegram-audio' ? 'audio'
    : input.source === 'telegram-video' ? 'video'
    : 'voice';

  const senderName = profile.displayName ?? profile.email?.split('@')[0] ?? 'Connectyall user';

  for (const c of extraction.contacts) {
    const contact = await ensureContact(input.userId, c);

    const png = await renderCard({
      profile: {
        displayName: senderName,
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
        displayName: senderName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        socials: profile.socials,
      },
      contactName: c.name,
      recap: c.recap,
    });

    let interactionId: string;
    let photoFileId: string | null = null;

    if (input.replyTo.surface === 'telegram') {
      const sent = await sendPhoto({ chatId: input.replyTo.chatId }, png, caption);
      photoFileId = sent.photoFileId;
      interactionId = await addInteraction(contact.id, sourceKind, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: photoFileId,
      });
    } else {
      interactionId = input.preMintedInteractionId ?? await addInteraction(contact.id, sourceKind, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: null,
      });
      await markReady(interactionId, contact.id, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: null,
      });
    }

    await uploadBytes({
      key: `cards/${interactionId}.png`,
      bytes: new Uint8Array(png),
      contentType: 'image/png',
    });

    if (input.replyTo.surface === 'telegram') {
      const handle = c.links.telegram?.replace(/^@/, '');
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
        { chatId: input.replyTo.chatId },
        handle ? `Forward this card to @${handle} 👇` : `Forward this card to ${c.name} 👇`,
        { replyMarkup }
      );
    }
  }
}
