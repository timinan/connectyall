import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import type { Socials } from '../lib/db/schema';
import { linkedinUrl, xUrl, telegramUrl, websiteUrl } from '../lib/social-urls';

const CAPTION_MAX = 1024;

export type CardProfile = {
  displayName: string;
  tagline: string | null;
  telegramUsername: string | null;
  socials: Socials;
};

function socialsBlock(profile: CardProfile): string {
  const lines: string[] = [];
  if (profile.telegramUsername) lines.push(`📱 ${telegramUrl(profile.telegramUsername)}`);
  if (profile.socials.x) lines.push(`🐦 ${xUrl(profile.socials.x)}`);
  if (profile.socials.linkedin) lines.push(`💼 ${linkedinUrl(profile.socials.linkedin)}`);
  if (profile.socials.email) lines.push(`📧 ${profile.socials.email}`);
  if (profile.socials.website) lines.push(`🌐 ${websiteUrl(profile.socials.website)}`);
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

// 512×512 — sized to read well as a chat-thread image without dominating.
const SIZE = 512;
const PHOTO = 480; // small margin around photo

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

export async function renderCard(input: {
  profile: CardProfile & { photoR2Url: string | null };
}): Promise<Buffer> {
  const fonts = loadFonts();
  const initial = (input.profile.displayName || '?').charAt(0).toUpperCase();
  const fallbackBg = pickBg(input.profile.displayName || initial);

  const photo = input.profile.photoR2Url
    ? {
        type: 'img',
        props: {
          src: input.profile.photoR2Url,
          width: PHOTO,
          height: PHOTO,
          style: { borderRadius: PHOTO / 2, objectFit: 'cover' },
        },
      }
    : {
        type: 'div',
        props: {
          style: {
            width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2,
            backgroundColor: fallbackBg, color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 220, fontWeight: 700, fontFamily: 'Inter',
          },
          children: initial,
        },
      };

  const tree = {
    type: 'div',
    props: {
      style: {
        width: SIZE, height: SIZE,
        backgroundColor: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter',
      },
      children: [photo],
    },
  };

  const svg = await satori(tree as any, {
    width: SIZE, height: SIZE,
    fonts: [
      { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } });
  return resvg.render().asPng();
}
