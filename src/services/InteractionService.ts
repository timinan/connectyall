import { and, eq } from 'drizzle-orm';
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

export async function mintStub(
  source: NewInteraction['source'],
  captureMetadata?: { userId: string; audioR2Key: string; mimeType: string },
): Promise<string> {
  const [row] = await db()
    .insert(interactions)
    .values({
      source,
      structuredData: {},
      status: 'processing',
      userId: captureMetadata?.userId ?? null,
      audioR2Key: captureMetadata?.audioR2Key ?? null,
      mimeType: captureMetadata?.mimeType ?? null,
    })
    .returning({ id: interactions.id });
  return row.id;
}

export async function markReady(interactionId: string, contactId: string, structuredData: unknown): Promise<boolean> {
  const updated = await db()
    .update(interactions)
    .set({ contactId, structuredData, status: 'ready' })
    .where(and(eq(interactions.id, interactionId), eq(interactions.status, 'processing')))
    .returning({ id: interactions.id });
  if (updated.length === 0) return false;
  await db().update(contacts).set({ lastTouchedAt: new Date() }).where(eq(contacts.id, contactId));
  return true;
}

export async function markFailed(interactionId: string): Promise<boolean> {
  const updated = await db()
    .update(interactions)
    .set({ status: 'failed' })
    .where(and(eq(interactions.id, interactionId), eq(interactions.status, 'processing')))
    .returning({ id: interactions.id });
  return updated.length > 0;
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
