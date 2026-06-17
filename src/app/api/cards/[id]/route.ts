import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getStatus } from '@/services/InteractionService';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { buildCaption } from '@/services/CardService';
import { env } from '@/lib/env';

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
    | { recap?: string; links?: { telegram?: string; x?: string; linkedin?: string; website?: string }; emails?: string[] }
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
      telegram: contact.links?.telegram ?? null,
      x: contact.links?.x ?? null,
      linkedin: contact.links?.linkedin ?? null,
      website: contact.links?.website ?? null,
      emails: contact.emails ?? [],
      phones: contact.phones ?? [],
      preferredChannel: contact.preferredChannel ?? null,
    },
    cardUrl: `/api/cards/${interaction.id}/image`, // same-origin proxy
    cardUrlExternal: `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`,
    caption,
    shareUrl: `${env().BASE_URL}/c/${interaction.id}`,
  });
}
