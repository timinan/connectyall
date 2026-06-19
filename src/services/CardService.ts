import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import type { Socials } from '../lib/db/schema';
import { downloadObject } from '../lib/r2/client';
import { buildShareMessage } from '../lib/share-message';

async function loadPhotoDataUrl(photoR2Url: string | null): Promise<string | null> {
  if (!photoR2Url) return null;
  // Photo URLs from uploadPhoto are now `/api/profile/photo/<userId>`. Parse the
  // userId, fetch the bytes via SDK, return a data: URL so satori doesn't have to
  // make a network request.
  const match = photoR2Url.match(/^\/api\/profile\/photo\/([^/?]+)(\?.*)?$/);
  if (!match) {
    // Legacy public R2 URL (pre-private-bucket). Passthrough — works while the
    // bucket is still public. Falls through to the initial-bubble once it's private.
    return photoR2Url;
  }
  const userId = match[1];
  for (const ext of ['png', 'jpg'] as const) {
    try {
      const bytes = await downloadObject(`profiles/${userId}.${ext}`);
      const b64 = Buffer.from(bytes).toString('base64');
      return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${b64}`;
    } catch { /* try next */ }
  }
  return null;
}

const CAPTION_MAX = 1024;

export type CardProfile = {
  displayName: string;
  tagline: string | null;
  telegramUsername: string | null;
  socials: Socials;
};

// Server-side wrapper around buildShareMessage that enforces the SMS/caption
// length cap. The new template only embeds a single share URL, not a full
// socials block — the public landing at shareUrl already lists every channel,
// so we don't have to cram them all into the message.
export function buildCaption(input: {
  contactName: string;
  recap: string;
  shareUrl: string | null;
}): string {
  const { contactName, shareUrl } = input;
  // Shrink the recap iteratively until the rendered message fits. Realistic
  // recaps clear the cap in one shot; this loop is the durable safety net.
  // Use the unicode ellipsis (…) — buildShareMessage's trailing-punct strip
  // matches /[.!?]+$/ and would eat plain "..." otherwise.
  let recap = input.recap;
  let truncated = false;
  for (let i = 0; i < 8; i++) {
    const draft = truncated ? recap + '…' : recap;
    const msg = buildShareMessage({ contactName, recap: draft, shareUrl });
    if (msg.length <= CAPTION_MAX) return msg;
    const over = msg.length - CAPTION_MAX;
    if (over >= recap.length) {
      recap = '';
    } else {
      recap = recap.slice(0, recap.length - over).trimEnd();
    }
    truncated = true;
  }
  // Final fallback — pathological inputs (e.g. shareUrl alone over cap).
  return buildShareMessage({ contactName, recap: '', shareUrl });
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

  const photoDataUrl = await loadPhotoDataUrl(input.profile.photoR2Url);

  const photo = photoDataUrl
    ? {
        type: 'img',
        props: {
          src: photoDataUrl,
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
