import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/env', () => ({
  env: () => ({
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_API_TOKEN: 'test-token',
  }),
}));

import { transcribe } from './TranscriptionService';

describe('transcribe', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs audio to Cloudflare Whisper and returns the text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { text: 'hello world' }, success: true }), { status: 200 })
    );

    const audio = new Uint8Array([1, 2, 3, 4]);
    const text = await transcribe(audio);

    expect(text).toBe('hello world');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/accounts/test-account/ai/run/@cf/openai/whisper');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('throws when Cloudflare returns success=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, errors: [{ message: 'bad audio' }] }), { status: 200 })
    );
    await expect(transcribe(new Uint8Array([0]))).rejects.toThrow(/bad audio/);
  });
});
