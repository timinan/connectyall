// Per-user calibration examples — canonical (transcript, expected_extraction)
// pairs the user signs off on during the voice-training flow. Injected as
// few-shot examples into the extraction prompt forever after. See
// docs/superpowers/specs/2026-06-24-personalization-design.md (Layer 3).

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { userCalibrationExamples, type UserCalibrationExample } from '../lib/db/schema';

const MAX_EXAMPLES_PER_USER = 10;

export async function listExamples(userId: string, limit = MAX_EXAMPLES_PER_USER): Promise<UserCalibrationExample[]> {
  return db()
    .select()
    .from(userCalibrationExamples)
    .where(eq(userCalibrationExamples.userId, userId))
    .orderBy(desc(userCalibrationExamples.createdAt))
    .limit(limit);
}

export async function addExample(input: {
  userId: string;
  transcript: string;
  expectedJson: unknown;
}): Promise<UserCalibrationExample> {
  const transcript = input.transcript.trim();
  if (!transcript) throw new Error('empty transcript');

  // Cap per user: if at-or-above limit, drop the oldest to make room.
  const existing = await listExamples(input.userId, MAX_EXAMPLES_PER_USER);
  if (existing.length >= MAX_EXAMPLES_PER_USER) {
    const oldest = existing[existing.length - 1];
    await db()
      .delete(userCalibrationExamples)
      .where(eq(userCalibrationExamples.id, oldest.id));
  }

  const [row] = await db()
    .insert(userCalibrationExamples)
    .values({
      userId: input.userId,
      transcript,
      expectedJson: input.expectedJson as object,
    })
    .returning();
  return row;
}

export async function deleteExample(userId: string, exampleId: string): Promise<void> {
  await db()
    .delete(userCalibrationExamples)
    .where(and(eq(userCalibrationExamples.id, exampleId), eq(userCalibrationExamples.userId, userId)));
}

export async function clearForUser(userId: string): Promise<void> {
  await db().delete(userCalibrationExamples).where(eq(userCalibrationExamples.userId, userId));
}
