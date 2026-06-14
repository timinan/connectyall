import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users, type Socials, type User, type NewUser } from '../lib/db/schema';
import { uploadPhoto } from '../lib/r2/client';
import { env } from '../lib/env';

export async function getProfile(telegramUserId: number): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
  return rows[0] ?? null;
}

export type UpsertProfileInput = Pick<NewUser, 'telegramUserId' | 'displayName'> &
  Partial<Pick<NewUser, 'telegramUsername' | 'tagline' | 'selfIntro'>>;

export async function upsertProfile(input: UpsertProfileInput): Promise<User> {
  const [row] = await db()
    .insert(users)
    .values(input)
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        displayName: input.displayName,
        telegramUsername: input.telegramUsername,
        tagline: input.tagline,
        selfIntro: input.selfIntro,
      },
    })
    .returning();
  return row;
}

export async function setSocial(
  telegramUserId: number,
  kind: keyof Socials,
  value: string
): Promise<void> {
  await db()
    .update(users)
    .set({ socials: sql`${users.socials} || ${JSON.stringify({ [kind]: value })}::jsonb` })
    .where(eq(users.telegramUserId, telegramUserId));
}

// Assumes the user row already exists (created during /start onboarding). If called for a
// non-existent user the R2 upload succeeds but the URL is not persisted — acceptable for v1
// because the bot's onboarding flow always calls upsertProfile before any photo step.
export async function setPhotoFromTelegram(
  telegramUserId: number,
  telegramFileId: string
): Promise<string> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const meta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${telegramFileId}`)
    .then((r) => r.json() as Promise<{ ok: boolean; result: { file_path: string } }>);
  if (!meta.ok) throw new Error('Telegram getFile failed');

  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  const bytes = new Uint8Array(await fileRes.arrayBuffer());

  const ext = meta.result.file_path.split('.').pop() ?? 'jpg';
  const url = await uploadPhoto({
    key: `profiles/${telegramUserId}.${ext}`,
    bytes,
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
  });

  await db().update(users).set({ photoR2Url: url }).where(eq(users.telegramUserId, telegramUserId));
  return url;
}
