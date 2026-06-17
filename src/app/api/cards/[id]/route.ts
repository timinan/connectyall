import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getStatus } from '@/services/InteractionService';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { buildCaption } from '@/services/CardService';
import { env } from '@/lib/env';

// Normalize string "null"/"none"/etc. to actual null at read time
// (guards against bad saves from older LLM responses)
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

  const { id } = await params;
  const stub = await getStatus(id);
  if (!stub) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (stub.status !== 'ready') {
    return NextResponse.json({ status: stub.status });
  }

  const found = await getInteractionWithContact(id);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { interaction, contact } = found;

  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const profile = await getById(session.user.id);
  if (!profile) return NextResponse.json({ error: 'profile missing' }, { status: 500 });

  const structured = interaction.structuredData as
    | { recap?: string; links?: { telegram?: string; x?: string; linkedin?: string; website?: string; whatsapp?: string; wechat?: string; line?: string }; emails?: string[] }
    | null;
  const recap = structured?.recap ?? '';
  const caption = buildCaption({
    profile: {
      displayName: profile.displayName,
      tagline: profile.tagline,
      telegramUsername: profile.telegramUsername,
      socials: profile.socials,
    },
    contactName: contact.name,
    recap,
  });

  return NextResponse.json({
    status: 'ready',
    interaction: { id: interaction.id, recap },
    contact: {
      id: contact.id,
      name: contact.name,
      notes: nullify(contact.notes),
      telegram: nullify(contact.links?.telegram),
      x: nullify(contact.links?.x),
      linkedin: nullify(contact.links?.linkedin),
      website: nullify(contact.links?.website),
      whatsapp: nullify(contact.links?.whatsapp),
      wechat: nullify(contact.links?.wechat),
      line: nullify(contact.links?.line),
      emails: contact.emails ?? [],
      phones: contact.phones ?? [],
      preferredChannel: contact.preferredChannel ?? null,
    },
    cardUrl: `/api/cards/${interaction.id}/image`, // same-origin proxy
    cardUrlExternal: `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`,
    caption: caption ?? '',
    shareUrl: `${env().BASE_URL}/c/${interaction.id}`,
  });
}
