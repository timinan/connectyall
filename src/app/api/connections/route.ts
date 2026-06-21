import { NextResponse } from 'next/server';
import { eq, desc, sql, and, lte } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions, followUps as followUpsTable, users } from '@/lib/db/schema';
import type { ChannelKind } from '@/app/app/cards/[id]/channel-icons';
import { endOfTodayUtc } from '@/services/FollowUpsService';

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

  const userRow = await db()
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const userTimezone = userRow[0]?.timezone ?? 'UTC';

  const cutoff = endOfTodayUtc(userTimezone);
  const dueRows = await db()
    .select({ contactId: followUpsTable.contactId })
    .from(followUpsTable)
    .where(and(
      eq(followUpsTable.userId, session.user.id),
      eq(followUpsTable.status, 'pending'),
      lte(followUpsTable.dueAt, cutoff),
    ));
  const dueContactIds = new Set(dueRows.map(r => r.contactId));
  const dueTodayCount = dueRows.length;

  const initialConnections = rows.map((r) => ({
    ...r,
    preferredChannel: r.preferredChannel as ChannelKind | null,
    lastTouchedAt: r.lastTouchedAt.toISOString(),
    hasDueTodayFollowUp: dueContactIds.has(r.contactId),
  }));

  return NextResponse.json({ connections: initialConnections, dueTodayCount });
}
