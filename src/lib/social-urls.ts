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

// WhatsApp — stored as phone number (digits only), URL uses wa.me/<digits>
export function whatsappHandle(input: string): string {
  return strip(input).replace(/\D/g, '');
}
export function whatsappUrl(input: string): string {
  return `https://wa.me/${whatsappHandle(input)}`;
}

// WeChat — stored as raw ID (alphanumeric + underscore)
export function wechatHandle(input: string): string {
  return strip(input).replace(/^https?:\/\/.*\//i, '');
}
export function wechatUrl(input: string): string {
  // WeChat has no reliable web deep-link. The 'weixin://' scheme opens the app
  // on iOS/Android but only to the home tab. For now we return a tel-style
  // link that just exposes the handle so the user can copy it.
  return `weixin://dl/chat?${wechatHandle(input)}`;
}

// Line — stored as Line ID (without ~ prefix), URL adds the ~
export function lineHandle(input: string): string {
  return strip(input).replace(/^https?:\/\/line\.me\/(ti\/)?p\/~?/i, '').replace(/^~/, '');
}
export function lineUrl(input: string): string {
  return `https://line.me/ti/p/~${lineHandle(input)}`;
}

// Instagram — stored as bare handle, URL is instagram.com/handle (profile)
export function instagramHandle(input: string): string {
  return strip(input)
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?instagram\.com\//i, '');
}
export function instagramUrl(input: string): string {
  return `https://instagram.com/${instagramHandle(input)}`;
}

// Facebook Messenger — stored as username, URL is m.me/<username> (opens chat)
export function messengerHandle(input: string): string {
  return strip(input)
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?m\.me\//i, '')
    .replace(/^(?:www\.)?facebook\.com\/(?:messages\/t\/)?/i, '');
}
export function messengerUrl(input: string): string {
  return `https://m.me/${messengerHandle(input)}`;
}
