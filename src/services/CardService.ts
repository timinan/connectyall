import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import type { Socials } from '../lib/db/schema';

const CAPTION_MAX = 1024;

export type CardProfile = {
  displayName: string;
  tagline: string | null;
  telegramUsername: string | null;
  socials: Socials;
};

function socialsBlock(profile: CardProfile): string {
  const lines: string[] = [];
  if (profile.telegramUsername) lines.push(`📱 t.me/${profile.telegramUsername}`);
  if (profile.socials.x) lines.push(`🐦 x.com/${profile.socials.x}`);
  if (profile.socials.linkedin) lines.push(`💼 ${profile.socials.linkedin}`);
  if (profile.socials.email) lines.push(`📧 ${profile.socials.email}`);
  if (profile.socials.website) lines.push(`🌐 ${profile.socials.website}`);
  return lines.join('\n');
}

export function buildCaption(input: {
  profile: CardProfile;
  contactName: string;
  recap: string;
}): string {
  const { profile, contactName, recap } = input;
  const socials = socialsBlock(profile);
  const build = (r: string) =>
    `Hey ${contactName}, great meeting you today.\n\nQuick recap: ${r}\n\nConnect with me:\n${socials}`;

  let caption = build(recap);
  if (caption.length <= CAPTION_MAX) return caption;

  // Truncate recap to fit. Reserve room for the rest of the template.
  const overhead = caption.length - recap.length;
  const allowedRecap = Math.max(0, CAPTION_MAX - overhead - 3); // 3 for "..."
  return build(recap.slice(0, allowedRecap).trimEnd() + '...');
}

const W = 1080;
const H = 1920;

let fontsCache: { regular: Buffer; bold: Buffer } | null = null;
function loadFonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  fontsCache = {
    regular: fs.readFileSync(path.join(dir, 'Inter-Regular.ttf')),
    bold: fs.readFileSync(path.join(dir, 'Inter-Bold.ttf')),
  };
  return fontsCache;
}

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function socialRow(profile: CardProfile): string {
  const items: string[] = [];
  if (profile.telegramUsername) items.push(`t.me/${profile.telegramUsername}`);
  if (profile.socials.x) items.push(`x.com/${profile.socials.x}`);
  if (profile.socials.linkedin) items.push(profile.socials.linkedin);
  if (profile.socials.email) items.push(profile.socials.email);
  return items.slice(0, 4).join('  •  ');
}

export async function renderCard(input: {
  profile: CardProfile & { photoR2Url: string | null };
  contactName: string;
  recap: string;
}): Promise<Buffer> {
  const fonts = loadFonts();
  const bg = pickBg(input.contactName);
  const initial = input.profile.displayName.charAt(0).toUpperCase();

  const tree = {
    type: 'div',
    props: {
      style: {
        width: W, height: H, display: 'flex', flexDirection: 'column',
        backgroundColor: bg, color: '#FFFFFF', padding: 80,
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 56, fontWeight: 400, opacity: 0.85, marginBottom: 80 },
            children: `For ${input.contactName}`,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
              marginBottom: 80,
            },
            children: [
              input.profile.photoR2Url
                ? {
                    type: 'img',
                    props: {
                      src: input.profile.photoR2Url,
                      width: 280, height: 280,
                      style: { borderRadius: 140, objectFit: 'cover' },
                    },
                  }
                : {
                    type: 'div',
                    props: {
                      style: {
                        width: 280, height: 280, borderRadius: 140,
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 128, fontWeight: 700,
                      },
                      children: initial,
                    },
                  },
              { type: 'div', props: { style: { fontSize: 96, fontWeight: 700 }, children: input.profile.displayName } },
              input.profile.tagline
                ? { type: 'div', props: { style: { fontSize: 36, opacity: 0.9, textAlign: 'center' }, children: input.profile.tagline } }
                : null,
            ].filter(Boolean),
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: 40, fontStyle: 'italic', lineHeight: 1.3,
              marginBottom: 60, opacity: 0.95,
            },
            children: `"We talked about: ${input.recap}"`,
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexWrap: 'wrap', fontSize: 28, opacity: 0.85, lineHeight: 1.5 },
            children: socialRow(input.profile),
          },
        },
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto', textAlign: 'right', fontSize: 22, opacity: 0.55,
            },
            children: 'made with Connectyall',
          },
        },
      ],
    },
  };

  const svg = await satori(tree as any, {
    width: W, height: H,
    fonts: [
      { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return resvg.render().asPng();
}
