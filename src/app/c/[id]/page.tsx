import { notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { env } from '@/lib/env';
import {
  linkedinUrl, xUrl, telegramUrl, websiteUrl, whatsappUrl, wechatUrl, lineUrl,
  instagramDmUrl, messengerUrl,
} from '@/lib/social-urls';
import { ChannelIcon, type ChannelKind } from '@/app/app/cards/[id]/channel-icons';
import { LANDING_CONTAINER_FLEX } from '@/app/app/_layout-constants';
import { PageHeader } from '@/components/page-header';
import { LogoMark } from '@/components/logo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return { title: 'Connectyall' };
  const sender = await getById(found.contact.userId);
  const title = `Card from ${sender?.displayName ?? 'Connectyall'}`;
  const description = sender?.shortBlurb ?? (found.interaction.structuredData as { recap?: string } | null)?.recap ?? '';
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

// Short mono tag shown left of each channel row on the public landing.
// 3-4 chars so every row's value column starts at the same x position.
const CHANNEL_TAG: Record<ChannelKind, string> = {
  email: 'MAIL',
  phone: 'PH',
  telegram: 'TG',
  x: 'X',
  linkedin: 'IN',
  website: 'WEB',
  whatsapp: 'WA',
  wechat: 'WC',
  line: 'LINE',
  instagram: 'IG',
  messenger: 'FB',
};

type PublicChannel = { kind: ChannelKind; display: string; href: string; action: 'send' | 'visit' };

function buildChannels(profile: {
  socials: { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string; phone?: string; instagram?: string; messenger?: string };
  telegramUsername: string | null;
}): PublicChannel[] {
  const out: PublicChannel[] = [];
  const s = profile.socials;
  if (s.email)    out.push({ kind: 'email',    display: s.email,                        href: `mailto:${s.email}`,                              action: 'send'  });
  if (s.phone)    out.push({ kind: 'phone',    display: s.phone,                        href: `sms:${s.phone.replace(/[^+0-9]/g, '')}`,         action: 'send'  });
  if (profile.telegramUsername) out.push({ kind: 'telegram', display: `t.me/${profile.telegramUsername}`, href: telegramUrl(profile.telegramUsername), action: 'visit' });
  if (s.x)        out.push({ kind: 'x',        display: `@${s.x}`,                      href: xUrl(s.x),                                        action: 'visit' });
  if (s.linkedin) out.push({ kind: 'linkedin', display: `in/${s.linkedin}`,             href: linkedinUrl(s.linkedin),                          action: 'visit' });
  if (s.website)  out.push({ kind: 'website',  display: s.website,                      href: websiteUrl(s.website),                            action: 'visit' });
  if (s.whatsapp) out.push({ kind: 'whatsapp', display: s.whatsapp,                     href: whatsappUrl(s.whatsapp),                          action: 'send'  });
  if (s.wechat)   out.push({ kind: 'wechat',   display: s.wechat,                       href: wechatUrl(s.wechat),                              action: 'send'  });
  if (s.line)     out.push({ kind: 'line',     display: s.line,                         href: lineUrl(s.line),                                  action: 'send'  });
  if (s.instagram) out.push({ kind: 'instagram', display: `@${s.instagram}`,            href: instagramDmUrl(s.instagram),                      action: 'send'  });
  if (s.messenger) out.push({ kind: 'messenger', display: s.messenger,                  href: messengerUrl(s.messenger),                        action: 'send'  });
  return out;
}

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default async function PublicCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) notFound();
  const { interaction, contact } = found;
  const profile = await getById(contact.userId);
  if (!profile) notFound();

  const recap = (interaction.structuredData as { recap?: string } | null)?.recap ?? '';
  const channels = buildChannels(profile);

  // Split display name so the last word picks up the brand-purple accent — matches
  // every other headline banner in the app.
  const nameParts = profile.displayName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? profile.displayName;
  const headlineFirst = nameParts.slice(0, -1).join(' ');
  const headlineLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : profile.displayName;

  const senderUpper = firstName.toUpperCase();
  const recipientUpper = contact.name.toUpperCase();
  const avatarInitial = (firstName.charAt(0) || '?').toUpperCase();

  return (
    <main className={`${LANDING_CONTAINER_FLEX} text-neutral-950 overflow-x-hidden`}>
      <PageHeader status={<><span className="text-brand">●</span> SHARED WITH YOU</>} />

      {/* Backdrop area: glow + banner + label + avatar + recap card all sit inside
          this relatively-positioned wrapper so the 560px backdrop centers on the
          avatar and washes purple behind every element above it. */}
      <div className="relative mt-4">
        {/* 560px backdrop glow — centered on avatar (~245px from top of this wrapper).
            Uses the same .glow-breathe rhythm as every other glow in the app. */}
        <div
          aria-hidden
          className="glow-breathe pointer-events-none absolute left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full z-0"
          style={{
            top: '-35px',
            background: 'radial-gradient(circle, rgba(124, 92, 255, 0.20) 0%, rgba(124, 92, 255, 0.06) 55%, rgba(124, 92, 255, 0) 78%)',
          }}
        >
          <div className="glow-breathe-d1 absolute inset-[80px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.08)' }} />
          <div className="glow-breathe-d2 absolute inset-[160px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.14)' }} />
        </div>

        {/* Headline banner — sender's name with last word accented */}
        <div className="relative z-10 bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
            {headlineFirst ? <>{headlineFirst} <span className="text-brand">{headlineLast}</span></> : <span className="text-brand">{headlineLast}</span>}
          </h1>
        </div>

        {/* Mono label naming the recipient */}
        <div className="relative z-10 font-mono text-[12px] tracking-[0.2em] uppercase text-muted font-semibold mt-3 pl-5">
          <span className="text-brand">●</span> FOR {recipientUpper}
        </div>

        {/* Avatar + optional short blurb */}
        <div className="relative z-10 flex flex-col items-center mt-6">
          {profile.photoR2Url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoR2Url}
              alt={profile.displayName}
              className="w-36 h-36 rounded-full object-cover shadow-[0_8px_24px_rgba(124,92,255,0.22)]"
            />
          ) : (
            <div
              className="w-36 h-36 rounded-full flex items-center justify-center text-white text-5xl font-extrabold shadow-[0_8px_24px_rgba(124,92,255,0.22)]"
              style={{ backgroundColor: pickBg(profile.displayName) }}
            >
              {avatarInitial}
            </div>
          )}
          {profile.shortBlurb && (
            <p className="text-[14px] text-neutral-700 mt-3.5 text-center leading-snug max-w-[300px] px-6">
              {profile.shortBlurb}
            </p>
          )}
        </div>

        {/* FROM card — recap quote */}
        {recap && (
          <div className="relative z-10 bg-surface border border-line rounded-2xl px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-3">
            <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold">FROM {senderUpper}</div>
            <p className="text-[13.5px] text-neutral-950 mt-1.5 leading-relaxed italic">&ldquo;{recap}&rdquo;</p>
          </div>
        )}
      </div>

      {/* HOW TO REACH card — read-only channels, sits outside the glow's radius */}
      {channels.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-3">
          <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold">HOW TO REACH {senderUpper}</div>
          <div className="mt-2 divide-y divide-line/60">
            {channels.map((c) => {
              const opensNewTab = c.href.startsWith('http');
              return (
                <a
                  key={c.kind}
                  href={c.href}
                  target={opensNewTab ? '_blank' : undefined}
                  rel={opensNewTab ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-2 py-2"
                >
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-brand font-bold w-9 flex-shrink-0">
                    {CHANNEL_TAG[c.kind]}
                  </span>
                  <ChannelIcon kind={c.kind} size={16} />
                  <span className="flex-1 min-w-0 truncate text-[13px] bg-cream border border-line rounded-md px-2 py-1">
                    {c.display}
                  </span>
                  <span className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full bg-brand text-white font-mono text-[10px] tracking-[0.14em] font-bold uppercase">
                    {c.action === 'send' ? 'Send' : 'Visit'}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary CTA: save to phone via vcard download */}
      <a
        href={`/c/${interaction.id}/vcard`}
        className="block w-full px-4 py-4 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase text-center mt-4 shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
      >
        Save {firstName} to phone
      </a>

      {/* Secondary CTA: invite to use the product */}
      <a
        href="/"
        className="block w-full px-4 py-3.5 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase text-center mt-2.5"
      >
        Start connecting with others
      </a>

      <a href="/" className="flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 transition pt-4">
        <LogoMark size={14} /> made with Connectyall
      </a>
    </main>
  );
}
