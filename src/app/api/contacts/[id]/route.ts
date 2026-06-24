import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { updateContactField } from '@/services/ContactService';
import { logCorrection, isLoggableField } from '@/services/CorrectionsService';
import { db } from '@/lib/db/client';
import { contacts, type ContactLinks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

// Read the current text value for a loggable kind so we can compare it to
// the incoming value and log a correction if they differ. Returns null when
// the kind isn't a single text value or the contact doesn't exist.
async function readCurrentText(contactId: string, kind: string, index?: number): Promise<string | null> {
  const [row] = await db()
    .select({ name: contacts.name, notes: contacts.notes, links: contacts.links, emails: contacts.emails, phones: contacts.phones })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!row) return null;
  if (kind === 'name') return row.name ?? null;
  if (kind === 'notes') return row.notes ?? null;
  if (kind === 'email' && typeof index === 'number') return row.emails?.[index] ?? null;
  if (kind === 'phone' && typeof index === 'number') return row.phones?.[index] ?? null;
  const linkKinds = ['telegram', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line', 'instagram', 'messenger'];
  if (linkKinds.includes(kind)) {
    const links = (row.links ?? {}) as ContactLinks;
    return (links as Record<string, string | undefined>)[kind] ?? null;
  }
  return null;
}

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

  // Snapshot prior text for the loggable field before the write, so we can
  // diff after. Skip the snapshot when the kind isn't loggable (clears, enum
  // picks, add/remove ops) to keep the PUT hot path fast.
  const incoming = parsed.data;
  const incomingValue = (incoming as { value?: string | null }).value;
  const incomingIndex = (incoming as { index?: number }).index;
  const hasNewValue = typeof incomingValue === 'string' && incomingValue.length > 0;
  const prior = (hasNewValue && isLoggableField(incoming.kind))
    ? await readCurrentText(id, incoming.kind, incomingIndex)
    : null;

  await updateContactField(id, incoming);

  if (prior && hasNewValue && incomingValue !== prior) {
    // Fire and don't await — the user response shouldn't wait on a write that
    // only benefits future captures. Errors are swallowed (best-effort logging).
    void logCorrection({
      userId: session.user.id,
      field: incoming.kind,
      originalText: prior,
      correctedText: incomingValue,
    }).catch(() => {});
  }

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

  // interactions are cascaded by the FK on contact_id.
  // R2 card PNGs for the contact's past interactions are not cleaned up here —
  // that cleanup will land in the privacy-hardening branch.
  await db().delete(contacts).where(eq(contacts.id, id));
  return NextResponse.json({ ok: true });
}
