import { and, asc, eq } from 'drizzle-orm'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { db } from '../lib/db/client';
import { followUps, type FollowUp } from '../lib/db/schema';

export async function createFollowUp(input: {
  userId: string;
  contactId: string;
  interactionId?: string;
  topic: string;
  dueAt: Date | null;
}): Promise<FollowUp> {
  const [row] = await db()
    .insert(followUps)
    .values({
      userId: input.userId,
      contactId: input.contactId,
      interactionId: input.interactionId ?? null,
      topic: input.topic,
      dueAt: input.dueAt,
      status: 'pending',
    })
    .returning();
  return row;
}

export async function createManyForInteraction(input: {
  userId: string;
  contactId: string;
  interactionId: string;
  followUps: Array<{ topic: string; dueAt: Date | null }>;
}): Promise<void> {
  if (input.followUps.length === 0) return;
  // Idempotency: if the janitor re-runs processCapture for this interaction,
  // we don't want duplicate follow-ups. Delete any existing rows for this
  // interaction before inserting the new set.
  await db().delete(followUps).where(eq(followUps.interactionId, input.interactionId));
  await db().insert(followUps).values(
    input.followUps.map((fu) => ({
      userId: input.userId,
      contactId: input.contactId,
      interactionId: input.interactionId,
      topic: fu.topic,
      dueAt: fu.dueAt,
      status: 'pending' as const,
    })),
  );
}

export async function listForContact(contactId: string): Promise<FollowUp[]> {
  return db()
    .select()
    .from(followUps)
    .where(eq(followUps.contactId, contactId))
    .orderBy(asc(followUps.status), asc(followUps.dueAt), asc(followUps.createdAt));
}

export async function updateFollowUp(
  id: string,
  updates: { topic?: string; dueAt?: Date | null; status?: 'pending' | 'done' },
): Promise<FollowUp> {
  const set: Record<string, unknown> = {};
  if (updates.topic !== undefined) set.topic = updates.topic;
  if (updates.dueAt !== undefined) set.dueAt = updates.dueAt;
  if (updates.status !== undefined) {
    set.status = updates.status;
    set.doneAt = updates.status === 'done' ? new Date() : null;
  }
  const [row] = await db().update(followUps).set(set).where(eq(followUps.id, id)).returning();
  return row;
}

export async function deleteFollowUp(id: string): Promise<void> {
  await db().delete(followUps).where(eq(followUps.id, id));
}
