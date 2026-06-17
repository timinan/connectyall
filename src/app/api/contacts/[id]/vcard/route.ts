import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { buildContactVCard } from '@/lib/vcard';
import { db } from '@/lib/db/client';
import { contacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const rows = await db().select().from(contacts).where(eq(contacts.id, id)).limit(1);
  const contact = rows[0];

  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const vcf = buildContactVCard({
    name: contact.name,
    emails: contact.emails ?? [],
    phones: contact.phones ?? [],
    telegram: contact.links?.telegram ?? null,
    x: contact.links?.x ?? null,
    linkedin: contact.links?.linkedin ?? null,
    website: contact.links?.website ?? null,
    whatsapp: contact.links?.whatsapp ?? null,
    wechat: contact.links?.wechat ?? null,
    line: contact.links?.line ?? null,
    company: contact.company,
    role: contact.role,
  });

  const safeName = contact.name.replace(/[^a-zA-Z0-9]/g, '_');
  return new NextResponse(vcf, {
    status: 200,
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.vcf"`,
    },
  });
}
