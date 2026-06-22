import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users, contacts } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [user] = await db()
    .select({
      tutorialCompletedAt: users.tutorialCompletedAt,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.userId, session.user.id));

  return NextResponse.json({
    tutorialCompletedAt: user?.tutorialCompletedAt ?? null,
    displayNameSet: Boolean(user?.displayName?.trim()),
    connectionsCount: count ?? 0,
  });
}

export async function POST() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await db()
    .update(users)
    .set({ tutorialCompletedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return new NextResponse(null, { status: 204 });
}
