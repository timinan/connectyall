import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fixture from './__fixtures__/nova3-response.json';

vi.mock('../lib/env', () => ({
  env: () => ({
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_API_TOKEN: 'tok',
    TRANSCRIBE_PROVIDER: 'whisper',
  }),
}));

import { transcribe, parseNova3Response } from './TranscriptionService';

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
    const result = await promise;
    expect(result.text).toBe('hello world');
    expect(result.segments).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and returns the eventual success', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('upstream', { status: 502 }));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.text).toBe('hello world');
    expect(result.segments).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries on a thrown network error (fetch rejects)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockRejectedValueOnce(new TypeError('failed to fetch'));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.text).toBe('hello world');
    expect(result.segments).toBeNull();
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
    const result = await promise;
    expect(result.text).toBe('');
    expect(result.segments).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uses octet-stream body when no initialPrompt is set', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([9, 9, 9]));
    await vi.runAllTimersAsync();
    await promise;
    const [, init] = f.mock.calls[0];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream');
    expect(init.body).toBeInstanceOf(Blob);
  });

  it('sends JSON body with initial_prompt when initialPrompt is set', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1, 2, 3]), { initialPrompt: 'Names: Sarah Lee, V.' });
    await vi.runAllTimersAsync();
    await promise;
    const [, init] = f.mock.calls[0];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(init.body as string);
    expect(parsed.initial_prompt).toBe('Names: Sarah Lee, V.');
    expect(parsed.audio).toEqual([1, 2, 3]);
  });
});

describe('parseNova3Response', () => {
  it('extracts transcript text', () => {
    const r = parseNova3Response(fixture);
    expect(r.text.length).toBeGreaterThan(0);
  });
  it('builds speaker segments, merging consecutive same-speaker utterances', () => {
    const r = parseNova3Response(fixture);
    expect(r.segments).not.toBeNull();
    expect(r.segments![0]).toEqual({ speaker: expect.any(Number), text: expect.any(String) });
    for (let i = 1; i < r.segments!.length; i++) {
      expect(r.segments![i].speaker).not.toBe(r.segments![i - 1].speaker); // merged
    }
  });
  it('survives malformed input', () => {
    expect(parseNova3Response({})).toEqual({ text: '', segments: null });
    expect(parseNova3Response(null)).toEqual({ text: '', segments: null });
  });
});
