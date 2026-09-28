// Server-side PingOne Management API client (worker app, client credentials).
// Used to mirror connectyall profile edits onto the PingOne user. PingOne is
// a mirror here, not the source of truth — callers must treat failures as
// non-fatal.
import { env, pingSyncEnabled } from '../env';

const AUTH_BASE = () => `https://auth.pingone.ca/${env().PING_ENV_ID}`;
const API_BASE = () => `https://api.pingone.ca/v1/environments/${env().PING_ENV_ID}`;

// Split a free-form display name the same way PingOne models it: first word
// is given name, the rest is family name.
export function splitDisplayName(displayName: string): { given: string; family?: string } {
  const parts = displayName.trim().split(/\s+/);
  const given = parts[0] ?? '';
  const family = parts.slice(1).join(' ') || undefined;
  return { given, family };
}

async function workerToken(fetchFn: typeof fetch): Promise<string> {
  const e = env();
  // PingOne worker apps default to Token Auth Method = Client Secret Basic;
  // secrets in the POST body get a bare 401.
  const basic = Buffer.from(`${e.PING_WORKER_CLIENT_ID}:${e.PING_WORKER_CLIENT_SECRET}`).toString('base64');
  const res = await fetchFn(`${AUTH_BASE()}/as/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`ping worker token failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('ping worker token missing access_token');
  return json.access_token;
}

async function findUserIdByEmail(email: string, token: string, fetchFn: typeof fetch): Promise<string | null> {
  const filter = encodeURIComponent(`email eq "${email}"`);
  const res = await fetchFn(`${API_BASE()}/users?filter=${filter}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ping user lookup failed: ${res.status}`);
  const json = (await res.json()) as { _embedded?: { users?: Array<{ id: string }> } };
  return json._embedded?.users?.[0]?.id ?? null;
}

/**
 * Mirror a connectyall display-name change onto the PingOne user with the
 * same email. No-op when the worker app isn't configured or no Ping user
 * matches. Throws on API errors — the caller decides whether that's fatal.
 */
export async function syncDisplayNameToPing(
  email: string,
  displayName: string,
  fetchFn: typeof fetch = fetch,
): Promise<'synced' | 'skipped'> {
  if (!pingSyncEnabled(env())) return 'skipped';
  const token = await workerToken(fetchFn);
  const userId = await findUserIdByEmail(email, token, fetchFn);
  if (!userId) return 'skipped';
  const { given, family } = splitDisplayName(displayName);
  const res = await fetchFn(`${API_BASE()}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: { given, family: family ?? '' } }),
  });
  if (!res.ok) throw new Error(`ping user update failed: ${res.status}`);
  return 'synced';
}
