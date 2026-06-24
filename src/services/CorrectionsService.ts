// Per-user correction memory. Every time the user fixes a contact field via
// the inline editor, we log the (original, corrected) pair so future captures
// can be biased toward what the user actually meant. See
// docs/superpowers/specs/2026-06-24-personalization-design.md (Layer 2).

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { userCorrections, type UserCorrection } from '../lib/db/schema';

// Fields we treat as worth memorizing. Enum picks (preferred channel) and
// pure deletions are excluded — they're not interesting as transcription hints.
const LOGGABLE_FIELDS = new Set([
  'name', 'notes',
  'telegram', 'x', 'linkedin', 'website',
  'whatsapp', 'wechat', 'line', 'instagram', 'messenger',
  'email', 'phone',
]);

export function isLoggableField(field: string): boolean {
  return LOGGABLE_FIELDS.has(field);
}

export async function logCorrection(input: {
  userId: string;
  field: string;
  originalText: string;
  correctedText: string;
}): Promise<void> {
  const original = input.originalText.trim();
  const corrected = input.correctedText.trim();
  if (!original || !corrected) return;
  if (original === corrected) return;
  if (!isLoggableField(input.field)) return;

  // Upsert: insert or bump used_count on the unique triple.
  await db()
    .insert(userCorrections)
    .values({
      userId: input.userId,
      field: input.field,
      originalText: original,
      correctedText: corrected,
    })
    .onConflictDoUpdate({
      target: [
        userCorrections.userId,
        userCorrections.field,
        userCorrections.originalText,
        userCorrections.correctedText,
      ],
      set: {
        usedCount: sql`${userCorrections.usedCount} + 1`,
        createdAt: new Date(),
      },
    });
}

export async function listRecentCorrections(userId: string, limit = 10): Promise<UserCorrection[]> {
  return db()
    .select()
    .from(userCorrections)
    .where(eq(userCorrections.userId, userId))
    .orderBy(desc(userCorrections.createdAt))
    .limit(limit);
}

export async function clearCorrectionsForUser(userId: string): Promise<void> {
  await db().delete(userCorrections).where(eq(userCorrections.userId, userId));
}

export async function deleteCorrection(userId: string, correctionId: string): Promise<void> {
  await db()
    .delete(userCorrections)
    .where(and(eq(userCorrections.id, correctionId), eq(userCorrections.userId, userId)));
}
