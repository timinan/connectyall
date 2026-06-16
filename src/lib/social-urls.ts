// Single source of truth for taking the raw stored value of a social handle
// (which may be a bare handle, a URL, or some half-formed paste) and producing
// a clean handle + a working full URL.

function strip(input: string): string {
  return input.trim().replace(/^@/, '').replace(/\/+$/, '');
}

export function linkedinHandle(input: string): string {
  return strip(input)
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?linkedin\.com\/(?:in|pub|company)\//i, '')
    .replace(/^in\//i, '');
}

export function linkedinUrl(input: string): string {
  return `https://linkedin.com/in/${linkedinHandle(input)}`;
}

export function xHandle(input: string): string {
  return strip(input)
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?(?:x\.com|twitter\.com)\//i, '');
}

export function xUrl(input: string): string {
  return `https://x.com/${xHandle(input)}`;
}

export function telegramHandle(input: string): string {
  return strip(input)
    .replace(/^https?:\/\//i, '')
    .replace(/^t\.me\//i, '');
}

export function telegramUrl(input: string): string {
  return `https://t.me/${telegramHandle(input)}`;
}

export function websiteUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function emailMailto(input: string): string {
  return `mailto:${input.trim()}`;
}
