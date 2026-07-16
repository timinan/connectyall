import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { updateContactField } from '@/services/ContactService';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('name'), value: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('telegram'), value: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/) }),
  z.object({ kind: z.literal('x'), value: z.string().min(1).max(50) }),
  z.object({ kind: z.literal('linkedin'), value: z.string().min(1).max(120) }),
  z.object({ kind: z.literal('website'), value: z.string().min(1).max(255) }),
  z.object({ kind: z.literal('email'), index: z.number().int().min(0), value: z.string().email() }),
  z.object({ kind: z.literal('email-add'), value: z.string().email() }),
  z.object({ kind: z.literal('email-remove'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('phone'), index: z.number().int().min(0), value: z.string().min(4).max(40) }),
  z.object({ kind: z.literal('phone-add'), value: z.string().min(4).max(40) }),
  z.object({ kind: z.literal('phone-remove'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('preferred'), value: z.enum(['telegram', 'email', 'phone', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line', 'instagram', 'messenger']).nullable() }),
  z.object({ kind: z.literal('notes'), value: z.string().max(500).nullable() }),
  z.object({ kind: z.literal('telegram-clear') }),
  z.object({ kind: z.literal('x-clear') }),
  z.object({ kind: z.literal('linkedin-clear') }),
  z.object({ kind: z.literal('website-clear') }),
  z.object({ kind: z.literal('whatsapp'), value: z.string().min(4).max(20) }),
  z.object({ kind: z.literal('wechat'), value: z.string().min(3).max(40) }),
  z.object({ kind: z.literal('line'), value: z.string().min(3).max(40) }),
  z.object({ kind: z.literal('instagram'), value: z.string().min(1).max(40) }),
  z.object({ kind: z.literal('messenger'), value: z.string().min(1).max(60) }),
  z.object({ kind: z.literal('whatsapp-clear') }),
  z.object({ kind: z.literal('wechat-clear') }),
  z.object({ kind: z.literal('line-clear') }),
  z.object({ kind: z.literal('instagram-clear') }),
  z.object({ kind: z.literal('messenger-clear') }),
]);

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

  await updateContactField(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const rows = await db().select({ userId: contacts.userId }).from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (rows[0].userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Delete R2 objects before the DB row so the cascade doesn't race us.
  // Best-effort: missing objects throw but must not block the contact delete.
  const interactionRows = await db()
    .select({ id: interactions.id, audioR2Key: interactions.audioR2Key })
    .from(interactions)
    .where(eq(interactions.contactId, id));
  for (const row of interactionRows) {
    try { await deleteObject(`cards/${row.id}.png`); } catch { /* already gone, ignore */ }
    if (row.audioR2Key) { try { await deleteObject(row.audioR2Key); } catch { /* ignore */ } }
  }

  // interactions are cascaded by the FK on contact_id.
  await db().delete(contacts).where(eq(contacts.id, id));
  return NextResponse.json({ ok: true });
}
