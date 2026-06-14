import { Telegraf, session } from 'telegraf';
import { env } from '../env';
import type { Context } from 'telegraf';

export type OnboardingState = {
  step?: 'awaiting_name' | 'awaiting_photo' | 'awaiting_tagline' | 'awaiting_socials' | null;
  partial?: { displayName?: string; tagline?: string };
};

export interface BotContext extends Context {
  session: { onboarding?: OnboardingState };
}

let cached: Telegraf<BotContext> | undefined;

export function bot(): Telegraf<BotContext> {
  if (cached) return cached;
  const b = new Telegraf<BotContext>(env().TELEGRAM_BOT_TOKEN);
  b.use(session({ defaultSession: () => ({}) }));
  cached = b;
  return cached;
}
