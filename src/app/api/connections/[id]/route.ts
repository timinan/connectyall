import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { listForContact } from '@/services/FollowUpsService';

const NULLISH = new Set(['null', 'none', 'n/a', 'undefined', '']);
function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  return NULLISH.has(v.toLowerCase()) ? null : v;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: contactId } = await params;

  const [contact] = await db()
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const allInteractions = await db()
    .select({
      id: interactions.id,
      occurredAt: interactions.occurredAt,
      structuredData: interactions.structuredData,
    })
    .from(interactions)
    .where(eq(interactions.contactId, contactId))
    .orderBy(desc(interactions.occurredAt));

  const latest = allInteractions[0] ?? null;
  const previous = allInteractions.slice(1).map((i) => ({
    interactionId: i.id,
    occurredAt: i.occurredAt,
    recap: (i.structuredData as { recap?: string } | null)?.recap ?? null,
  }));

  const latestRecap = (latest?.structuredData as { recap?: string } | null)?.recap ?? null;

  const followUps = await listForContact(contactId);

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      role: contact.role,
      company: contact.company,
      emails: contact.emails ?? [],
      phones: contact.phones ?? [],
      preferredChannel: contact.preferredChannel ?? null,
      notes: nullify(contact.notes),
      telegram: nullify(contact.links?.telegram),
      x: nullify(contact.links?.x),
      linkedin: nullify(contact.links?.linkedin),
      website: nullify(contact.links?.website),
      whatsapp: nullify(contact.links?.whatsapp),
      wechat: nullify(contact.links?.wechat),
      line: nullify(contact.links?.line),
      instagram: nullify(contact.links?.instagram),
      messenger: nullify(contact.links?.messenger),
    },
    latestInteractionId: latest?.id ?? null,
    latestRecap,
    previousMeetings: previous,
    shareUrl: latest ? `${env().BASE_URL}/c/${latest.id}` : null,
    followUps,
  });
}
