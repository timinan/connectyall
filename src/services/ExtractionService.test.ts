import { describe, it, expect, vi, beforeEach } from 'vitest';

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
