import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users, type Socials, type User, type NewUser } from '../lib/db/schema';
import { uploadPhoto } from '../lib/r2/client';
import { env } from '../lib/env';

export async function getById(id: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getByTelegramUserId(telegramUserId: number): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
  return rows[0] ?? null;
}

export async function getByEmail(email: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

// Legacy alias for bot code paths that haven't migrated yet.
export const getProfile = getByTelegramUserId;

export type UpsertProfileInput = Pick<NewUser, 'displayName'> &
  Partial<Pick<NewUser, 'telegramUserId' | 'telegramUsername' | 'tagline' | 'selfIntro' | 'id' | 'email'>>;

export async function upsertProfile(input: UpsertProfileInput): Promise<User> {
  // When telegramUserId is provided, upsert on telegramUserId (bot flow).
  // When id is provided, update by id (web flow).
  if (input.telegramUserId !== undefined && input.telegramUserId !== null) {
    const [row] = await db()
      .insert(users)
      .values({
        displayName: input.displayName,
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername ?? null,
        tagline: input.tagline ?? null,
        selfIntro: input.selfIntro ?? null,
      })
      .onConflictDoUpdate({
        target: users.telegramUserId,
        set: {
          displayName: input.displayName,
          telegramUsername: input.telegramUsername ?? null,
          tagline: input.tagline ?? null,
          selfIntro: input.selfIntro ?? null,
        },
      })
      .returning();
    return row;
  }
  if (!input.id) throw new Error('upsertProfile requires either telegramUserId or id');
  const [row] = await db()
    .update(users)
    .set({
      displayName: input.displayName,
      tagline: input.tagline ?? null,
      selfIntro: input.selfIntro ?? null,
    })
    .where(eq(users.id, input.id))
    .returning();
  return row;
}

export async function setSocial(
  userId: string,
  kind: keyof Socials,
  value: string
): Promise<void> {
  await db()
    .update(users)
    .set({ socials: sql`${users.socials} || ${JSON.stringify({ [kind]: value })}::jsonb` })
    .where(eq(users.id, userId));
}

export async function setPhotoFromTelegram(
  userId: string,
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
    key: `profiles/${userId}.${ext}`,
    bytes,
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
  });

  await db().update(users).set({ photoR2Url: url }).where(eq(users.id, userId));
  return url;
}

export async function setPhotoFromBytes(
  userId: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const url = await uploadPhoto({
    key: `profiles/${userId}.${ext}`,
    bytes,
    contentType,
  });
  await db().update(users).set({ photoR2Url: url }).where(eq(users.id, userId));
  return url;
}
