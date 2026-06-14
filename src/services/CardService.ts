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
