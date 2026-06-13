import { describe, it, expect, vi } from 'vitest';

vi.mock('./env', () => ({
  env: () => ({
    LLM_PROVIDER: 'anthropic',
    LLM_MODEL: 'claude-haiku-4-5',
    ANTHROPIC_API_KEY: 'test-key',
  }),
}));

describe('getLLM', () => {
  it('returns an Anthropic model when provider is anthropic', async () => {
    const { getLLM } = await import('./llm');
    const model = getLLM();
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });
});
