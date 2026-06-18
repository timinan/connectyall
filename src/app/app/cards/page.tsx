import Link from 'next/link';
import { getServerSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');

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

  return (
    <div className="p-6 pb-20 max-w-md mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your connections</h1>
        <Link href="/app/record" className="px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition">+ Record</Link>
      </div>
      <ul className="space-y-3">
        {rows.length === 0 && <p className="text-neutral-600">No connections yet. Record your first memo.</p>}
        {rows.map((r) => (
          <li key={r.interactionId}>
            <Link href={`/app/cards/${r.interactionId}`} className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-lg hover:border-neutral-400 transition">
              <img src={`${base}/cards/${r.interactionId}.png`} alt={r.contactName} className="w-12 h-20 object-cover rounded" />
              <div className="flex-1">
                <p className="font-semibold">{r.contactName}</p>
                <p className="text-xs text-neutral-600">{new Date(r.occurredAt).toLocaleDateString()}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
