import { NextResponse } from 'next/server';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { buildVCard } from '@/lib/vcard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return new NextResponse('Not found', { status: 404 });
  const profile = await getById(found.contact.userId);
  if (!profile) return new NextResponse('Not found', { status: 404 });

  const vcf = buildVCard({
    displayName: profile.displayName,
    tagline: profile.tagline,
    socials: profile.socials,
    telegramUsername: profile.telegramUsername,
  });

  return new NextResponse(vcf, {
    status: 200,
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${profile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}.vcf"`,
    },
  });
}
