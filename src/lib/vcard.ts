import type { Socials } from './db/schema';

const CRLF = '\r\n';

function ensureUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function buildVCard(input: {
  displayName: string;
  tagline: string | null;
  socials: Socials;
  telegramUsername: string | null;
}): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`, `N:${input.displayName};;;;`];
  if (input.tagline) lines.push(`TITLE:${input.tagline}`);
  if (input.socials.email) lines.push(`EMAIL;TYPE=INTERNET:${input.socials.email}`);
  if (input.socials.website) lines.push(`URL;TYPE=Website:${ensureUrl(input.socials.website)}`);
  if (input.socials.x) lines.push(`URL;TYPE=Twitter:https://x.com/${input.socials.x}`);
  if (input.socials.linkedin) {
    const handle = input.socials.linkedin.replace(/^in\//, '');
    lines.push(`URL;TYPE=LinkedIn:https://linkedin.com/in/${handle}`);
  }
  if (input.telegramUsername) lines.push(`URL;TYPE=Telegram:https://t.me/${input.telegramUsername}`);
  lines.push('END:VCARD');
  return lines.join(CRLF);
}
