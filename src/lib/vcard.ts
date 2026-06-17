import type { Socials } from './db/schema';
import { linkedinUrl, xUrl, telegramUrl, websiteUrl, whatsappUrl, wechatUrl, lineUrl } from './social-urls';

const CRLF = '\r\n';

function splitName(fullName: string): { given: string; family: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: '', family: '' };
  if (parts.length === 1) return { given: parts[0], family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

export function buildVCard(input: {
  displayName: string;
  tagline: string | null;
  socials: Socials;
  telegramUsername: string | null;
}): string {
  const { given, family } = splitName(input.displayName);
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`, `N:${family};${given};;;`];
  if (input.tagline) lines.push(`TITLE:${input.tagline}`);
  if (input.socials.email) lines.push(`EMAIL;TYPE=INTERNET:${input.socials.email}`);
  if (input.socials.website) lines.push(`URL;TYPE=Website:${websiteUrl(input.socials.website)}`);
  if (input.socials.x) lines.push(`URL;TYPE=Twitter:${xUrl(input.socials.x)}`);
  if (input.socials.linkedin) lines.push(`URL;TYPE=LinkedIn:${linkedinUrl(input.socials.linkedin)}`);
  if (input.telegramUsername) lines.push(`URL;TYPE=Telegram:${telegramUrl(input.telegramUsername)}`);
  if (input.socials.whatsapp) lines.push(`URL;TYPE=WhatsApp:${whatsappUrl(input.socials.whatsapp)}`);
  if (input.socials.wechat) lines.push(`URL;TYPE=WeChat:${wechatUrl(input.socials.wechat)}`);
  if (input.socials.line) lines.push(`URL;TYPE=Line:${lineUrl(input.socials.line)}`);
  lines.push('END:VCARD');
  return lines.join(CRLF);
}

export function buildContactVCard(input: {
  name: string;
  emails: string[];
  phones: string[];
  telegram: string | null;
  x: string | null;
  linkedin: string | null;
  website: string | null;
  whatsapp?: string | null;
  wechat?: string | null;
  line?: string | null;
  company?: string | null;
  role?: string | null;
}): string {
  const { given, family } = splitName(input.name);
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.name}`, `N:${family};${given};;;`];
  if (input.company) lines.push(`ORG:${input.company}`);
  if (input.role) lines.push(`TITLE:${input.role}`);
  for (const email of input.emails) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
  for (const phone of input.phones) lines.push(`TEL:${phone}`);
  if (input.telegram) lines.push(`URL;TYPE=Telegram:${telegramUrl(input.telegram)}`);
  if (input.x) lines.push(`URL;TYPE=Twitter:${xUrl(input.x)}`);
  if (input.linkedin) lines.push(`URL;TYPE=LinkedIn:${linkedinUrl(input.linkedin)}`);
  if (input.website) lines.push(`URL;TYPE=Website:${websiteUrl(input.website)}`);
  if (input.whatsapp) lines.push(`URL;TYPE=WhatsApp:${whatsappUrl(input.whatsapp)}`);
  if (input.wechat) lines.push(`URL;TYPE=WeChat:${wechatUrl(input.wechat)}`);
  if (input.line) lines.push(`URL;TYPE=Line:${lineUrl(input.line)}`);
  lines.push('END:VCARD');
  return lines.join(CRLF);
}
