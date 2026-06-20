import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));
vi.mock('ai', async () => ({
  generateObject: generateObjectMock,
}));
vi.mock('../lib/llm', () => ({ getLLM: () => ({ id: 'mock-model' }) }));

import { extract } from './ExtractionService';

describe('extract', () => {
  beforeEach(() => generateObjectMock.mockReset());

  it('returns structured contacts from a transcript', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        contacts: [{
          name: 'Sarah Chen', role: 'PM', company: 'Acme',
          emails: ['sarah@acme.com'],
          phones: [],
          preferred_channel: 'email',
          links: { x: 'sarahc', linkedin: 'sarah-chen' },
          context: 'Met at coffee in Vancouver',
          recap: 'We talked about USDC replacing bank rails.',
          user_commitments: ['send deck'],
          their_commitments: ['intro to CFO'],
        }],
        was_live_recording: false,
      },
    });

    const result = await extract({
      transcript: 'met Sarah Chen, PM at Acme, talked about USDC',
      selfIntro: 'I am a PM building crypto products',
    });

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Sarah Chen');
    expect(result.was_live_recording).toBe(false);
  });

  it('returns empty contacts when LLM finds none', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { contacts: [], was_live_recording: false },
    });

    const result = await extract({ transcript: 'rambling note about nothing', selfIntro: '' });
    expect(result.contacts).toHaveLength(0);
  });
});

describe('extract (with retry)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateObjectMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('retries when generateObject throws a transient 5xx-shaped error', async () => {
    const transient = Object.assign(new Error('upstream'), { statusCode: 503 });
    generateObjectMock
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({
        object: { contacts: [], was_live_recording: false },
      });
    const promise = extract({ transcript: 'hi', selfIntro: '' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.contacts).toHaveLength(0);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a retryable 429', async () => {
    const tooMany = Object.assign(new Error('rate limited'), { statusCode: 429 });
    generateObjectMock
      .mockRejectedValueOnce(tooMany)
      .mockResolvedValueOnce({
        object: { contacts: [], was_live_recording: false },
      });
    const promise = extract({ transcript: 'hi', selfIntro: '' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.contacts).toHaveLength(0);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on a 4xx that is not 429', async () => {
    const badReq = Object.assign(new Error('bad input'), { statusCode: 400 });
    generateObjectMock.mockRejectedValueOnce(badReq);
    const assertion = expect(extract({ transcript: 'hi', selfIntro: '' })).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});
