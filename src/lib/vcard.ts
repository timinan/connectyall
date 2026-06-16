import type { Socials } from './db/schema';
import { linkedinUrl, xUrl, telegramUrl, websiteUrl } from './social-urls';

const CRLF = '\r\n';

export function buildVCard(input: {
  displayName: string;
  tagline: string | null;
  socials: Socials;
  telegramUsername: string | null;
}): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`, `N:${input.displayName};;;;`];
  if (input.tagline) lines.push(`TITLE:${input.tagline}`);
  if (input.socials.email) lines.push(`EMAIL;TYPE=INTERNET:${input.socials.email}`);
  if (input.socials.website) lines.push(`URL;TYPE=Website:${websiteUrl(input.socials.website)}`);
  if (input.socials.x) lines.push(`URL;TYPE=Twitter:${xUrl(input.socials.x)}`);
  if (input.socials.linkedin) lines.push(`URL;TYPE=LinkedIn:${linkedinUrl(input.socials.linkedin)}`);
  if (input.telegramUsername) lines.push(`URL;TYPE=Telegram:${telegramUrl(input.telegramUsername)}`);
  lines.push('END:VCARD');
  return lines.join(CRLF);
}
