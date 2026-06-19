import { notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { env } from '@/lib/env';
import { linkedinUrl, xUrl, telegramUrl, websiteUrl, whatsappUrl, wechatUrl, lineUrl } from '@/lib/social-urls';
import { CHANNEL_ICONS, ChannelIcon, type ChannelKind } from '@/app/app/cards/[id]/channel-icons';
import { LogoMark } from '@/components/logo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return { title: 'Connectyall' };
  const sender = await getById(found.contact.userId);
  const title = `Card from ${sender?.displayName ?? 'Connectyall'}`;
  const description = (found.interaction.structuredData as { recap?: string } | null)?.recap ?? '';
  const cardUrl = `${env().BASE_URL}/api/cards/${found.interaction.id}/image`;
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
  const cardUrl = `${env().BASE_URL}/api/cards/${interaction.id}/image`;

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
    <main className="min-h-[100dvh] text-neutral-950 px-6 py-8 pb-10 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold text-center pt-4">FOR {contact.name.toUpperCase()}</p>
        <div className="flex justify-center">
          <img
            src={cardUrl}
            alt={profile.displayName}
            className="w-[116px] h-[116px] rounded-full object-cover bg-white border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-[30px] font-extrabold tracking-tight">
            <span className="text-brand">{profile.displayName}</span>
          </h1>
          {profile.tagline && <p className="text-[13px] text-muted">{profile.tagline}</p>}
        </div>
        {recap && (
          <p className="italic text-neutral-600 text-[13px] text-center leading-relaxed">&ldquo;{recap}&rdquo;</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl px-3 py-3 flex items-center gap-2 border border-line hover:border-brand/40 transition"
            >
              <ChannelIcon kind={l.kind} size={16} />
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase font-bold text-neutral-950">{CHANNEL_ICONS[l.kind].label.toUpperCase()}</span>
            </a>
          ))}
        </div>
        <a
          href={`/c/${interaction.id}/vcard`}
          className="block w-full px-4 py-4 rounded-full bg-neutral-950 text-white font-bold text-center hover:bg-neutral-800 transition"
        >
          💾 Save {profile.displayName.split(' ')[0]} to Contacts
        </a>
        <a href="/" className="flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 transition pt-2">
          <LogoMark size={14} /> made with Connectyall
        </a>
      </div>
    </main>
  );
}
