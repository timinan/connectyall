import { eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { interactions, contacts, type NewInteraction } from '../lib/db/schema';

export async function updateRecap(interactionId: string, recap: string): Promise<void> {
  const rows = await db()
    .select({ structuredData: interactions.structuredData })
    .from(interactions)
    .where(eq(interactions.id, interactionId))
    .limit(1);
  const existing = (rows[0]?.structuredData as Record<string, unknown> | null) ?? {};
  const merged = { ...existing, recap };
  await db()
    .update(interactions)
    .set({ structuredData: merged })
    .where(eq(interactions.id, interactionId));
}

export async function mintStub(source: NewInteraction['source']): Promise<string> {
  const [row] = await db()
    .insert(interactions)
    .values({
      source,
      structuredData: {},
      status: 'processing',
    })
    .returning({ id: interactions.id });
  return row.id;
}

export async function markReady(
  interactionId: string,
  contactId: string,
  structuredData: unknown
): Promise<void> {
  await db()
    .update(interactions)
    .set({ contactId, structuredData, status: 'ready' })
    .where(eq(interactions.id, interactionId));
  await db()
    .update(contacts)
    .set({ lastTouchedAt: new Date() })
    .where(eq(contacts.id, contactId));
}

export async function markFailed(interactionId: string): Promise<void> {
  await db()
    .update(interactions)
    .set({ status: 'failed' })
    .where(eq(interactions.id, interactionId));
}

export async function getStatus(
  interactionId: string
): Promise<{ id: string; status: 'processing' | 'ready' | 'failed'; contactId: string | null; structuredData: unknown } | null> {
  const rows = await db()
    .select({
      id: interactions.id,
      status: interactions.status,
      contactId: interactions.contactId,
      structuredData: interactions.structuredData,
    })
    .from(interactions)
    .where(eq(interactions.id, interactionId))
    .limit(1);
  return rows[0] ?? null;
}
