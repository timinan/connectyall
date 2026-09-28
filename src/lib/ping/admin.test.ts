import { describe, it, expect, beforeEach, vi } from 'vitest';
import { splitDisplayName, syncDisplayNameToPing, createPingUser } from './admin';
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

// Faithful registration mock: enforces the real gates — Basic-auth token,
// population required on create, the password.set content type, and that
// email-device pairing happens on the created user.
function registrationApiMock(opts: { createStatus?: number; pwStatus?: number } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: u, init });
    if (u === `https://auth.pingone.ca/${ENV_ID}/as/token`) {
      const expected = `Basic ${Buffer.from('worker-id:worker-secret').toString('base64')}`;
      if (headers.authorization !== expected) return new Response('{}', { status: 401 });
      return Response.json({ access_token: 'tok-1' });
    }
    if (headers.authorization !== 'Bearer tok-1') return new Response('unauthorized', { status: 401 });
    const api = `https://api.pingone.ca/v1/environments/${ENV_ID}`;
    if (u === `${api}/populations`) {
      return Response.json({ _embedded: { populations: [{ id: 'pop-x' }, { id: 'pop-default', default: true }] } });
    }
    if (u === `${api}/users` && init?.method === 'POST') {
      if (opts.createStatus) return new Response('{}', { status: opts.createStatus });
      const body = JSON.parse(String(init.body));
      if (!body.population?.id || body.username !== body.email) return new Response('{}', { status: 400 });
      return Response.json({ id: 'new-user-1' });
    }
    if (u === `${api}/users/new-user-1/password` && init?.method === 'PUT') {
      if (headers['content-type'] !== 'application/vnd.pingidentity.password.set+json') {
        return new Response('wrong content type', { status: 400 });
      }
      return new Response(opts.pwStatus ? '{}' : '{}', { status: opts.pwStatus ?? 200 });
    }
    if (u === `${api}/users/new-user-1/mfaEnabled` && init?.method === 'PUT') {
      return Response.json({ mfaEnabled: true });
    }
    if (u === `${api}/users/new-user-1/devices` && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (body.type !== 'EMAIL' || !body.email) return new Response('{}', { status: 400 });
      return Response.json({ id: 'dev-1' });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('createPingUser', () => {
  beforeEach(() => withPingEnv());

  it('creates user with username = email, sets password, enables MFA, pairs email device', async () => {
    const { fetchFn, calls } = registrationApiMock();
    await expect(createPingUser('new@user.dev', 'longenoughpw', fetchFn)).resolves.toBe('created');
    const create = calls.find((c) => c.url.endsWith('/users') && c.init?.method === 'POST');
    expect(JSON.parse(String(create?.init?.body)).username).toBe('new@user.dev');
    expect(JSON.parse(String(create?.init?.body)).population.id).toBe('pop-default');
    expect(calls.some((c) => c.url.endsWith('/devices'))).toBe(true);
  });

  it('reports exists on a 409 without touching password or devices', async () => {
    const { fetchFn, calls } = registrationApiMock({ createStatus: 409 });
    await expect(createPingUser('dup@user.dev', 'longenoughpw', fetchFn)).resolves.toBe('exists');
    expect(calls.some((c) => c.url.includes('/password'))).toBe(false);
  });

  it('throws when the password set is rejected (policy failure)', async () => {
    const { fetchFn } = registrationApiMock({ pwStatus: 400 });
    await expect(createPingUser('new@user.dev', 'weak', fetchFn)).rejects.toThrow(/password set failed/);
  });

  it('throws when the worker is not configured', async () => {
    withoutPingEnv();
    const { fetchFn } = registrationApiMock();
    await expect(createPingUser('new@user.dev', 'longenoughpw', fetchFn)).rejects.toThrow(/not configured/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
