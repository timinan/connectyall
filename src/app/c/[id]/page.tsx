import { notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return { title: 'Connectyall' };
  return {
    title: `Card from ${(await getById(found.contact.userId))?.displayName ?? 'Connectyall'}`,
    description: (found.interaction.structuredData as { recap?: string } | null)?.recap ?? '',
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

  const links: Array<{ label: string; href: string }> = [];
  if (profile.telegramUsername) links.push({ label: '📱 Telegram', href: `https://t.me/${profile.telegramUsername}` });
  if (profile.socials.x) links.push({ label: '🐦 X', href: `https://x.com/${profile.socials.x}` });
  if (profile.socials.linkedin) {
    const handle = profile.socials.linkedin.replace(/^in\//, '');
    links.push({ label: '💼 LinkedIn', href: `https://linkedin.com/in/${handle}` });
  }
  if (profile.socials.email) links.push({ label: '📧 Email', href: `mailto:${profile.socials.email}` });
  if (profile.socials.website) {
    const url = /^https?:\/\//i.test(profile.socials.website) ? profile.socials.website : `https://${profile.socials.website}`;
    links.push({ label: '🌐 Website', href: url });
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <img src={cardUrl} alt={`Card for ${contact.name}`} className="w-full rounded-2xl" />
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-400">For {contact.name}</p>
          <h1 className="text-3xl font-bold">{profile.displayName}</h1>
          {profile.tagline && <p className="text-neutral-300">{profile.tagline}</p>}
        </div>
        {recap && (
          <p className="italic text-neutral-300 text-center">&ldquo;{recap}&rdquo;</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-center text-sm">
              {l.label}
            </a>
          ))}
        </div>
        <a
          href={`/c/${interaction.id}/vcard`}
          className="block w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold text-center"
        >
          💾 Save {profile.displayName.split(' ')[0]} to Contacts
        </a>
        <p className="text-center text-xs text-neutral-500"><a href="/" className="underline">made with Connectyall</a></p>
      </div>
    </main>
  );
}
