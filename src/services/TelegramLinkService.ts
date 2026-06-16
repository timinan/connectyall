import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../lib/db/client';
import { telegramLinkTokens, users } from '../lib/db/schema';

const TOKEN_TTL_SECONDS = 60 * 10; // 10 minutes

export async function issueLinkToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(16).toString('hex');
  await db()
    .insert(telegramLinkTokens)
    .values({
      token,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
    });
  return token;
}

export async function consumeLinkToken(
  token: string,
  telegramUserId: number,
  telegramUsername: string | null
): Promise<boolean> {
  const rows = await db()
    .select({ userId: telegramLinkTokens.userId, expiresAt: telegramLinkTokens.expiresAt })
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;
  await db()
    .update(users)
    .set({ telegramUserId, telegramUsername })
    .where(eq(users.id, row.userId));
  await db().delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token));
  return true;
}
