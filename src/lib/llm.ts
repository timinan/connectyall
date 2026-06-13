import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { env } from './env';

export function getLLM(): LanguageModel {
  const e = env();
  switch (e.LLM_PROVIDER) {
    case 'anthropic': {
      if (!e.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required for provider=anthropic');
      return createAnthropic({ apiKey: e.ANTHROPIC_API_KEY })(e.LLM_MODEL);
    }
    case 'google': {
      if (!e.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY required for provider=google');
      return createGoogleGenerativeAI({ apiKey: e.GOOGLE_GENERATIVE_AI_API_KEY })(e.LLM_MODEL);
    }
    case 'openai': {
      if (!e.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for provider=openai');
      return createOpenAI({ apiKey: e.OPENAI_API_KEY })(e.LLM_MODEL);
    }
  }
}
