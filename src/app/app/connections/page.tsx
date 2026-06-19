import { redirect } from 'next/navigation';
import { eq, desc, sql } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { ConnectionsList } from './connections-list';
import type { ChannelKind } from '../cards/[id]/channel-icons';

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

  const initialConnections = rows.map((r) => ({
    ...r,
    preferredChannel: r.preferredChannel as ChannelKind | null,
    lastTouchedAt: r.lastTouchedAt.toISOString(),
  }));

  return <ConnectionsList initialConnections={initialConnections} />;
}
