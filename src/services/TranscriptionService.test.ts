import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/env', () => ({
  env: () => ({
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_API_TOKEN: 'tok',
  }),
}));

import { transcribe } from './TranscriptionService';

const okBody = { success: true, result: { text: 'hello world' } };
const errBody = { success: false, errors: [{ message: 'kaboom' }] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('transcribe (with retry)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the transcript on first success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1, 2, 3]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and returns the eventual success', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('upstream', { status: 502 }));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries on a thrown network error (fetch rejects)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockRejectedValueOnce(new TypeError('failed to fetch'));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx (treats it as non-retryable)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    const promise = transcribe(new Uint8Array([1]));
    // Attach rejection handler before advancing timers so Vitest doesn't flag
    // the rejection as unhandled (fake-timers fires rejections before .rejects
    // can register in the same microtask queue).
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rethrows when all 3 attempts fail', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response('upstream', { status: 503 }));
    const promise = transcribe(new Uint8Array([1]));
    // Attach rejection handler before advancing timers so Vitest doesn't flag
    // the rejection as unhandled.
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('throws (non-retryable) when Whisper returns success:false in the body', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse(errBody));
    const promise = transcribe(new Uint8Array([1]));
    // Attach rejection handler before advancing timers so Vitest doesn't flag
    // the rejection as unhandled.
    const assertion = expect(promise).rejects.toThrow(/kaboom/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns empty string when result.text is absent in a success body', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse({ success: true, result: {} }));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
