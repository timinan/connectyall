import { describe, it, expect } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('parses required fields', () => {
    const env = loadEnv(process.env);
    expect(env.DATABASE_URL).toMatch(/^postgres/);
    expect(env.MAX_CAPTURES_PER_DAY).toBe(50);
  });

  it('defaults LLM_PROVIDER and LLM_MODEL', () => {
    const env = loadEnv({
      ...process.env,
      LLM_PROVIDER: undefined,
      LLM_MODEL: undefined,
    });
    expect(env.LLM_PROVIDER).toBe('anthropic');
    expect(env.LLM_MODEL).toBe('claude-haiku-4-5');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadEnv({ ...process.env, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('throws on invalid LLM_PROVIDER', () => {
    expect(() =>
      loadEnv({ ...process.env, LLM_PROVIDER: 'gemini' })
    ).toThrow(/LLM_PROVIDER/);
  });

  it('throws when LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      loadEnv({ ...process.env, ANTHROPIC_API_KEY: undefined })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });
});
