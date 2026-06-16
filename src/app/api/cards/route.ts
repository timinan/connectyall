import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db()
    .select({
      interactionId: interactions.id,
      contactName: contacts.name,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .innerJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(eq(contacts.userId, session.user.id))
    .orderBy(desc(interactions.occurredAt))
    .limit(50);

  const base = env().R2_PUBLIC_URL_BASE;
  return NextResponse.json({
    cards: rows.map((r) => ({
      interactionId: r.interactionId,
      contactName: r.contactName,
      occurredAt: r.occurredAt,
      cardUrl: `${base}/cards/${r.interactionId}.png`,
    })),
  });
}
