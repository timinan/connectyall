import { describe, it, expect, beforeEach, vi } from 'vitest';
import { splitDisplayName, syncDisplayNameToPing } from './admin';
import { resetEnvCache } from '../env';

const ENV_ID = 'env-123';

function withPingEnv() {
  process.env.PING_ENV_ID = ENV_ID;
  process.env.PING_WORKER_CLIENT_ID = 'worker-id';
  process.env.PING_WORKER_CLIENT_SECRET = 'worker-secret';
  resetEnvCache();
}

function withoutPingEnv() {
  delete process.env.PING_ENV_ID;
  delete process.env.PING_WORKER_CLIENT_ID;
  delete process.env.PING_WORKER_CLIENT_SECRET;
  resetEnvCache();
}

// Faithful mock: enforces the token → lookup → patch order, auth headers,
// and the form-encoded client-credentials body — the gates a real PingOne
// environment applies.
function pingApiMock(opts: { userId?: string | null; patchStatus?: number } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === `https://auth.pingone.ca/${ENV_ID}/as/token`) {
      const body = String(init?.body);
      const basic = (init?.headers as Record<string, string> | undefined)?.authorization;
      const expected = `Basic ${Buffer.from('worker-id:worker-secret').toString('base64')}`;
      // PingOne worker apps use Client Secret Basic — a secret in the POST
      // body must be rejected the way the real token endpoint rejects it.
      if (!body.includes('grant_type=client_credentials') || basic !== expected) {
        return new Response('{"error":"invalid_client"}', { status: 401 });
      }
      return Response.json({ access_token: 'tok-1' });
    }
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    if (auth !== 'Bearer tok-1') return new Response('unauthorized', { status: 401 });
    if (u.startsWith(`https://api.pingone.ca/v1/environments/${ENV_ID}/users?filter=`)) {
      const users = opts.userId === null ? [] : [{ id: opts.userId ?? 'u-1' }];
      return Response.json({ _embedded: { users } });
    }
    if (u === `https://api.pingone.ca/v1/environments/${ENV_ID}/users/${opts.userId ?? 'u-1'}` && init?.method === 'PATCH') {
      return new Response(opts.patchStatus === 200 || !opts.patchStatus ? '{}' : 'err', { status: opts.patchStatus ?? 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('splitDisplayName', () => {
  it('splits first word as given, rest as family', () => {
    expect(splitDisplayName('Demo User')).toEqual({ given: 'Demo', family: 'User' });
    expect(splitDisplayName('Ana de la Cruz')).toEqual({ given: 'Ana', family: 'de la Cruz' });
  });

  it('handles single-word names and stray whitespace', () => {
    expect(splitDisplayName('  Cher  ')).toEqual({ given: 'Cher', family: undefined });
  });
});

describe('syncDisplayNameToPing', () => {
  beforeEach(() => withPingEnv());

  it('skips when the worker app is not configured', async () => {
    withoutPingEnv();
    const { fetchFn } = pingApiMock();
    await expect(syncDisplayNameToPing('a@b.c', 'Demo User', fetchFn)).resolves.toBe('skipped');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips when no Ping user matches the email', async () => {
    const { fetchFn } = pingApiMock({ userId: null });
    await expect(syncDisplayNameToPing('a@b.c', 'Demo User', fetchFn)).resolves.toBe('skipped');
  });

  it('patches the matched user with split given/family name', async () => {
    const { fetchFn, calls } = pingApiMock({ userId: 'u-42' });
    await expect(syncDisplayNameToPing('a@b.c', 'Demo Renamed', fetchFn)).resolves.toBe('synced');
    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(patch?.url).toContain('/users/u-42');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ name: { given: 'Demo', family: 'Renamed' } });
  });

  it('throws on a failed patch so callers can log it', async () => {
    const { fetchFn } = pingApiMock({ userId: 'u-42', patchStatus: 400 });
    await expect(syncDisplayNameToPing('a@b.c', 'Demo Renamed', fetchFn)).rejects.toThrow(/update failed: 400/);
  });
});
