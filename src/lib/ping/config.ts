// Client-safe PingOne values. Env ID and client ID appear in every
// authorize URL, so exposing them via NEXT_PUBLIC_* is by design.
export const PING_ENV_ID = process.env.NEXT_PUBLIC_PING_ENV_ID ?? '';
export const PING_CLIENT_ID = process.env.NEXT_PUBLIC_PING_CLIENT_ID ?? '';
export const PING_AUTH_BASE = `https://auth.pingone.ca/${PING_ENV_ID}/as`;
export const PING_WELLKNOWN = `${PING_AUTH_BASE}/.well-known/openid-configuration`;

export function pingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PING_ENABLED === '1' && Boolean(PING_ENV_ID && PING_CLIENT_ID);
}
