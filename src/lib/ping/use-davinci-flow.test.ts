import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- scripted mock of @forgerock/davinci-client -------------------------
// Each test configures `scenario` before creating a flow.

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const textCol = { type: 'TextCollector', output: { key: 'username', label: 'Username' } };
const passCol = { type: 'PasswordCollector', output: { key: 'password', label: 'Password' } };

let davinciCalls = 0;
let updateCalls: Array<{ key: string; value: unknown }> = [];
let nextCalls = 0;
// nextResults is a queue of nodes returned by successive next() calls
let nextResults: Any[] = [];
let collectors: Any[] = [textCol, passCol];
let fidoResult: Any = { code: 'ok' };
let fidoThrows = false;

const davinciMock = vi.fn(async () => {
  davinciCalls++;
  return {
    start: vi.fn(async () => ({ status: 'continue' })),
    getCollectors: vi.fn(() => collectors),
    update: vi.fn((col: Any) => (value: unknown) => {
      updateCalls.push({ key: col.output?.key, value });
    }),
    next: vi.fn(async () => {
      const n = nextResults[nextCalls] ?? { status: 'success' };
      nextCalls++;
      return n;
    }),
  };
});

const fidoMock = vi.fn(() => ({
  authenticate: vi.fn(async () => {
    if (fidoThrows) {
      const e: Any = new Error('sec');
      e.code = 'SecurityError';
      return e;
    }
    return fidoResult;
  }),
}));

vi.mock('@forgerock/davinci-client', () => ({
  davinci: (...a: Any[]) => (davinciMock as Any)(...a),
  fido: (...a: Any[]) => (fidoMock as Any)(...a),
}));

import { DavinciFlow } from './use-davinci-flow';

beforeEach(() => {
  davinciCalls = 0;
  updateCalls = [];
  nextCalls = 0;
  nextResults = [];
  collectors = [textCol, passCol];
  fidoResult = { code: 'ok' };
  fidoThrows = false;
  davinciMock.mockClear();
  fidoMock.mockClear();
});

describe('DavinciFlow', () => {
  it('(a) start transitions idle->loading->continue and exposes collectors', async () => {
    const flow = new DavinciFlow();
    const seen: string[] = [];
    flow.subscribe(() => seen.push(flow.state.status));
    expect(flow.state.status).toBe('idle');
    await flow.start();
    expect(seen).toContain('loading');
    expect(flow.state.status).toBe('continue');
    expect(flow.state.collectors).toHaveLength(2);
  });

  it('(b) calling start twice only creates one client', async () => {
    const flow = new DavinciFlow();
    await Promise.all([flow.start(), flow.start()]);
    expect(davinciCalls).toBe(1);
  });

  it('(c) submit calls update for each key then next, landing on success', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    await flow.submit({ username: 'ann', password: 'pw' });
    expect(updateCalls).toEqual([
      { key: 'username', value: 'ann' },
      { key: 'password', value: 'pw' },
    ]);
    expect(nextCalls).toBe(1);
    expect(flow.state.status).toBe('success');
  });

  it('(d) a next returning error 401 triggers exactly one automatic start retry', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    expect(davinciCalls).toBe(1);
    nextResults = [{ status: 'error', internalHttpStatus: 401 }];
    await flow.submit({ username: 'ann', password: 'pw' });
    // one retry => a second davinci() client created
    expect(davinciCalls).toBe(2);
    expect(flow.state.status).toBe('continue');
  });

  it('(e) fido SecurityError sets friendly passkey errorText and does not call next', async () => {
    collectors = [{ type: 'FidoAuthenticationCollector', output: { config: {} } }];
    fidoThrows = true;
    const flow = new DavinciFlow();
    await flow.start();
    await flow.submit({});
    expect(flow.state.errorText).toMatch(/passkey/i);
    expect(nextCalls).toBe(0);
  });
});
