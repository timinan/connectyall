import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { contacts, followUps, type FollowUp } from '../lib/db/schema';

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

// "End of today" in the user's local timezone, expressed as a UTC timestamp.
// Used by the due-today query to decide which follow-ups are "due by EOD today
// in the user's local zone."
export function endOfTodayUtc(timezone: string): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
    // 23:59:59 local of that ymd
    const localEnd = Date.UTC(y, m, d, 23, 59, 59);
    // Resolve local-wall-time → UTC by checking what formatToParts(localEnd as utc)
    // reads in the target zone, then shifting.
    const probe = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(localEnd));
    const hh = parseInt(probe.find(p => p.type === 'hour')!.value, 10);
    const mm = parseInt(probe.find(p => p.type === 'minute')!.value, 10);
    const offset = (23 * 60 + 59) - (hh * 60 + mm);
    return new Date(localEnd + offset * 60_000);
  } catch {
    // Bad timezone → end of UTC today
    const utc = new Date();
    utc.setUTCHours(23, 59, 59, 999);
    return utc;
  }
}

export async function countDueTodayForUser(
  userId: string,
  timezone: string,
): Promise<number> {
  const cutoff = endOfTodayUtc(timezone);
  const rows = await db()
    .select({ id: followUps.id })
    .from(followUps)
    .where(and(
      eq(followUps.userId, userId),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ))
    .orderBy(asc(followUps.dueAt));
  return rows.length;
}

export async function listDueTodayForUser(
  userId: string,
  timezone: string,
): Promise<Array<FollowUp & { contactName: string }>> {
  const cutoff = endOfTodayUtc(timezone);
  const rows = await db()
    .select({
      id: followUps.id,
      userId: followUps.userId,
      contactId: followUps.contactId,
      interactionId: followUps.interactionId,
      topic: followUps.topic,
      dueAt: followUps.dueAt,
      status: followUps.status,
      createdAt: followUps.createdAt,
      doneAt: followUps.doneAt,
      contactName: contacts.name,
    })
    .from(followUps)
    .innerJoin(contacts, eq(contacts.id, followUps.contactId))
    .where(and(
      eq(followUps.userId, userId),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ))
    .orderBy(asc(followUps.dueAt));
  return rows;
}
