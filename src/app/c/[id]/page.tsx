import { notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { env } from '@/lib/env';
import { linkedinUrl, xUrl, telegramUrl, websiteUrl, whatsappUrl, wechatUrl, lineUrl } from '@/lib/social-urls';
import { CHANNEL_ICONS, ChannelIcon, type ChannelKind } from '@/app/app/cards/[id]/channel-icons';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return { title: 'Connectyall' };
  const sender = await getById(found.contact.userId);
  const title = `Card from ${sender?.displayName ?? 'Connectyall'}`;
  const description = (found.interaction.structuredData as { recap?: string } | null)?.recap ?? '';
  const cardUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${found.interaction.id}.png`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: cardUrl, width: 512, height: 512, alt: title }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [cardUrl],
    },
  };
}

export default async function PublicCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) notFound();
  const { interaction, contact } = found;
  const profile = await getById(contact.userId);
  if (!profile) notFound();

  const recap = (interaction.structuredData as { recap?: string } | null)?.recap ?? '';
  const cardUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`;

  const links: Array<{ kind: ChannelKind; href: string }> = [];
  if (profile.telegramUsername) links.push({ kind: 'telegram', href: telegramUrl(profile.telegramUsername) });
  if (profile.socials.x) links.push({ kind: 'x', href: xUrl(profile.socials.x) });
  if (profile.socials.linkedin) links.push({ kind: 'linkedin', href: linkedinUrl(profile.socials.linkedin) });
  if (profile.socials.email) links.push({ kind: 'email', href: `mailto:${profile.socials.email}` });
  if (profile.socials.website) links.push({ kind: 'website', href: websiteUrl(profile.socials.website) });
  if (profile.socials.whatsapp) links.push({ kind: 'whatsapp', href: whatsappUrl(profile.socials.whatsapp) });
  if (profile.socials.wechat) links.push({ kind: 'wechat', href: wechatUrl(profile.socials.wechat) });
  if (profile.socials.line) links.push({ kind: 'line', href: lineUrl(profile.socials.line) });

  return (
    <main className="min-h-[calc(100dvh-3rem)] bg-neutral-50 text-neutral-950 p-6 pb-10 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <div className="flex justify-center pt-4">
          <img
            src={cardUrl}
            alt={profile.displayName}
            className="w-48 h-48 rounded-full object-cover bg-white border border-neutral-200"
          />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-600">For {contact.name}</p>
          <h1 className="text-3xl font-bold"><span className="text-brand">{profile.displayName}</span></h1>
          {profile.tagline && <p className="text-neutral-700">{profile.tagline}</p>}
        </div>
        {recap && (
          <p className="italic text-neutral-700 text-center">&ldquo;{recap}&rdquo;</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="px-4 py-3 rounded-lg bg-white border border-neutral-200 text-neutral-950 text-center text-sm flex items-center justify-center gap-2 hover:border-neutral-400 transition">
              <ChannelIcon kind={l.kind} size={18} />
              <span>{CHANNEL_ICONS[l.kind].label}</span>
            </a>
          ))}
        </div>
        <a
          href={`/c/${interaction.id}/vcard`}
          className="block w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold text-center hover:bg-neutral-800 transition"
        >
          💾 Save {profile.displayName.split(' ')[0]} to Contacts
        </a>
      </div>
    </main>
  );
}
