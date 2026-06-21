import { redirect } from 'next/navigation';
import { eq, desc, sql, lte, and } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions, followUps, users } from '@/lib/db/schema';
import { ConnectionsList } from './connections-list';
import type { ChannelKind } from '../cards/[id]/channel-icons';
import { endOfTodayUtc } from '@/services/FollowUpsService';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');

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
    .select({ contactId: followUps.contactId })
    .from(followUps)
    .where(and(
      eq(followUps.userId, session.user.id),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ));
  const dueContactIds = new Set(dueRows.map((r) => r.contactId));
  const dueTodayCount = dueRows.length;

  const initialConnections = rows.map((r) => ({
    ...r,
    preferredChannel: r.preferredChannel as ChannelKind | null,
    lastTouchedAt: r.lastTouchedAt.toISOString(),
    hasDueTodayFollowUp: dueContactIds.has(r.contactId),
  }));

  return <ConnectionsList initialConnections={initialConnections} dueTodayCount={dueTodayCount} />;
}
