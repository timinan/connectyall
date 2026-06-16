import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { setContactLink } from '@/services/ContactService';
import { db } from '@/lib/db/client';
import { contacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  telegram: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/).optional(),
  name: z.string().min(1).max(80).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const rows = await db().select({ userId: contacts.userId }).from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!rows[0] || rows[0].userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad input' }, { status: 400 });

  if (parsed.data.telegram !== undefined) await setContactLink(id, 'telegram', parsed.data.telegram);
  if (parsed.data.name !== undefined) {
    await db().update(contacts).set({ name: parsed.data.name }).where(eq(contacts.id, id));
  }
  return NextResponse.json({ ok: true });
}
