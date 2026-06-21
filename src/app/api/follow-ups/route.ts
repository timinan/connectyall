import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts } from '@/lib/db/schema';
import { createFollowUp } from '@/services/FollowUpsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  contactId: z.string().uuid(),
  topic: z.string().min(1).max(280),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Verify the contact belongs to this user.
  const [contact] = await db()
    .select({ userId: contacts.userId })
    .from(contacts)
    .where(eq(contacts.id, parsed.data.contactId))
    .limit(1);
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 });
  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const row = await createFollowUp({
    userId: session.user.id,
    contactId: parsed.data.contactId,
    topic: parsed.data.topic,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
  });
  return NextResponse.json({ followUp: row });
}
