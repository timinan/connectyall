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
let nextThrows = false;
// start() outcome, keyed by client index; default 'continue'.
let startResults: Any[] = [];
let startThrows: boolean[] = [];
let flowCalls: Any[] = [];
let flowResult: Any = { status: 'continue' };

const davinciMock = vi.fn(async () => {
  const idx = davinciCalls;
  davinciCalls++;
  return {
    start: vi.fn(async () => {
      if (startThrows[idx]) throw new Error('boom');
      return startResults[idx] ?? { status: 'continue' };
    }),
    getCollectors: vi.fn(() => collectors),
    update: vi.fn((col: Any) => (value: unknown) => {
      updateCalls.push({ key: col.output?.key, value });
    }),
    next: vi.fn(async () => {
      if (nextThrows) throw new Error('next boom');
      const n = nextResults[nextCalls] ?? { status: 'success' };
      nextCalls++;
      return n;
    }),
    flow: vi.fn((action: Any) => {
      flowCalls.push(action);
      return async () => flowResult;
    }),
  };
});

const fidoMock = vi.fn(() => ({
  authenticate: vi.fn(async () => {
    if (fidoThrows) {
      // Real browsers throw a DOMException with name 'SecurityError' (no code).
      const e: Any = new Error('sec');
      e.name = 'SecurityError';
      throw e;
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
  nextThrows = false;
  startResults = [];
  startThrows = [];
  flowCalls = [];
  flowResult = { status: 'continue' };
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

  it('(e) fido SecurityError via submit sets friendly passkey errorText and does not call next', async () => {
    // A mixed node (submit button + fido) still routes through submit(); guard
    // the auto-run so this exercises the submit() path deterministically.
    collectors = [
      passCol,
      { type: 'FidoAuthenticationCollector', output: { config: {} } },
    ];
    fidoThrows = true;
    const flow = new DavinciFlow();
    await flow.start();
    await new Promise((r) => setTimeout(r, 0)); // let any auto-run settle
    updateCalls = [];
    await flow.submit({ password: 'pw' });
    expect(flow.state.errorText).toMatch(/passkey/i);
    expect(nextCalls).toBe(0);
  });

  it('(g) a node with a FidoAuthenticationCollector auto-runs the ceremony and advances', async () => {
    collectors = [{ type: 'FidoAuthenticationCollector', output: { config: {} } }];
    fidoResult = { code: 'ok' };
    const flow = new DavinciFlow();
    await flow.start();
    // auto-submit is fired via a floating promise inside applyNode; let it settle
    await new Promise((r) => setTimeout(r, 0));
    // fido ran and the client was advanced without any external submit() call
    expect(fidoMock).toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(nextCalls).toBe(1);
    expect(flow.state.status).toBe('success');
  });

  it('(h) a SecurityError on the auto-run shows passkey message and does not call next', async () => {
    collectors = [{ type: 'FidoAuthenticationCollector', output: { config: {} } }];
    fidoThrows = true;
    const flow = new DavinciFlow();
    await flow.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(fidoMock).toHaveBeenCalled();
    expect(flow.state.errorText).toMatch(/passkey/i);
    expect(flow.state.status).toBe('continue');
    expect(nextCalls).toBe(0);
  });

  it('(i) a throw from next() during the fido auto-run fails gracefully', async () => {
    collectors = [{ type: 'FidoAuthenticationCollector', output: { config: {} } }];
    fidoResult = { code: 'ok' };
    nextThrows = true;
    const flow = new DavinciFlow();
    await flow.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(flow.state.status).toBe('failed');
    expect(flow.state.errorText).toBe('Ping sign-in hit a snag. Try again or use the email code.');
  });

  it('(j) an error node keeps the form and shows the server message inline (wrong password)', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    nextResults = [
      {
        status: 'error',
        error: { message: 'Check your credentials and try again.', status: 'error' },
      },
    ];
    await flow.submit({ username: 'ann', password: 'wrong' });
    expect(flow.state.status).toBe('continue');
    expect(flow.state.collectors).toHaveLength(2);
    expect(flow.state.errorText).toBe('Check your credentials and try again.');
    // the same client is reusable: a corrected submit succeeds
    await flow.submit({ username: 'ann', password: 'right' });
    expect(flow.state.status).toBe('success');
  });

  it('(k) an error node with no collectors left falls back to failed', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    collectors = [];
    nextResults = [{ status: 'error', error: { message: 'Flow is gone.', status: 'error' } }];
    await flow.submit({ username: 'ann', password: 'pw' });
    expect(flow.state.status).toBe('failed');
    expect(flow.state.errorText).toBe('Flow is gone.');
  });

  it('(l) a 401 carried on node.error.internalHttpStatus also triggers the restart', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    nextResults = [{ status: 'error', error: { message: 'Session expired', internalHttpStatus: 401 } }];
    await flow.submit({ username: 'ann', password: 'pw' });
    expect(davinciCalls).toBe(2);
    expect(flow.state.status).toBe('continue');
  });

  it('(m) a failure node is fatal and surfaces the server message', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    nextResults = [{ status: 'failure', error: { message: 'Flow failed.', status: 'failure' } }];
    await flow.submit({ username: 'ann', password: 'pw' });
    expect(flow.state.status).toBe('failed');
    expect(flow.state.errorText).toBe('Flow failed.');
  });

  it('(p) a NotAllowedError (cancelled/timed-out passkey prompt) fails with a specific message', async () => {
    collectors = [{ type: 'FidoAuthenticationCollector', output: { config: {} } }];
    fidoResult = Object.assign(new Error('cancel'), { name: 'NotAllowedError' });
    const flow = new DavinciFlow();
    await flow.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(flow.state.status).toBe('failed');
    expect(flow.state.errorText).toMatch(/cancelled or timed out/i);
    expect(nextCalls).toBe(0);
    // TRY AGAIN restarts cleanly
    await flow.start();
    expect(davinciCalls).toBe(2);
  });

  it('(q) fido SecurityError on auto-run auto-cancels via the node cancel link, once', async () => {
    collectors = [
      { type: 'FidoAuthenticationCollector', output: { config: {} } },
      { type: 'FlowCollector', output: { key: 'cancel-flow-link', label: 'Cancel' } },
    ];
    fidoThrows = true;
    flowResult = { status: 'continue' }; // cancel lands on a fresh node
    const flow = new DavinciFlow();
    await flow.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(flowCalls).toEqual([{ action: 'cancel-flow-link' }]);
    // the fresh node still contains fido (mock reuses collectors) but the
    // once-per-flow guard stops a second auto-cancel loop
    await new Promise((r) => setTimeout(r, 0));
    expect(flowCalls).toHaveLength(1);
    expect(flow.state.errorText).toMatch(/passkey/i);
  });

  it('(n) chooseFlow uses client.flow() with the collector key, not update+next', async () => {
    const flow = new DavinciFlow();
    await flow.start();
    await flow.chooseFlow({ type: 'FlowCollector', output: { key: 'passkey-flow-link' } });
    expect(flowCalls).toEqual([{ action: 'passkey-flow-link' }]);
    expect(updateCalls).toHaveLength(0);
    expect(nextCalls).toBe(0);
    expect(flow.state.status).toBe('continue');
  });

  it('(o) chooseFlow surfaces an internal_error as failed', async () => {
    flowResult = { type: 'internal_error', error: { message: 'Missing argument.action' } };
    const flow = new DavinciFlow();
    await flow.start();
    await flow.chooseFlow({ type: 'FlowCollector', output: { key: 'x' } });
    expect(flow.state.status).toBe('failed');
  });

  it('(f) start after a failed node clears the dead client and retries (TRY AGAIN)', async () => {
    startThrows = [true]; // first client's start() throws => failed
    const flow = new DavinciFlow();
    await flow.start();
    expect(flow.state.status).toBe('failed');
    expect(davinciCalls).toBe(1);
    // TRY AGAIN: second start() must build a fresh client and reach continue.
    await flow.start();
    expect(davinciCalls).toBe(2);
    expect(flow.state.status).toBe('continue');
  });
});
