import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { followUps } from '@/lib/db/schema';
import { updateFollowUp, deleteFollowUp } from '@/services/FollowUpsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({
  topic: z.string().min(1).max(280).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: z.enum(['pending', 'done']).optional(),
});

async function authorizeOwn(id: string, sessionUserId: string): Promise<boolean> {
  const [row] = await db()
    .select({ userId: followUps.userId })
    .from(followUps)
    .where(eq(followUps.id, id))
    .limit(1);
  if (!row) return false;
  return row.userId === sessionUserId;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await authorizeOwn(id, session.user.id))) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const row = await updateFollowUp(id, {
    topic: parsed.data.topic,
    dueAt: parsed.data.dueAt !== undefined
      ? (parsed.data.dueAt === null ? null : new Date(parsed.data.dueAt))
      : undefined,
    status: parsed.data.status,
  });
  return NextResponse.json({ followUp: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await authorizeOwn(id, session.user.id))) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  await deleteFollowUp(id);
  return NextResponse.json({ ok: true });
}
