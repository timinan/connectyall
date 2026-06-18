import { NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db()
    .select({
      contactId: contacts.id,
      name: contacts.name,
      company: contacts.company,
      role: contacts.role,
      preferredChannel: contacts.preferredChannel,
      lastTouchedAt: contacts.lastTouchedAt,
      meetingsCount: sql<number>`count(${interactions.id})::int`,
    })
    .from(contacts)
    .leftJoin(interactions, eq(interactions.contactId, contacts.id))
    .where(eq(contacts.userId, session.user.id))
    .groupBy(contacts.id)
    .orderBy(desc(contacts.lastTouchedAt))
    .limit(100);

  return NextResponse.json({ connections: rows });
}
