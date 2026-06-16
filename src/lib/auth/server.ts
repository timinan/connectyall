import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { env } from '../env';
import { sendMagicLinkEmail } from '../email/resend';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: any;

export function auth() {
  if (cached) return cached as ReturnType<typeof betterAuth>;
  cached = betterAuth({
    baseURL: env().BETTER_AUTH_URL,
    secret: env().BETTER_AUTH_SECRET,
    advanced: {
      database: {
        generateId: () => randomUUID(),
      },
    },
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      fields: {
        name: 'displayName',
      },
      additionalFields: {
        telegramUserId: { type: 'number', required: false },
        telegramUsername: { type: 'string', required: false },
        tagline: { type: 'string', required: false },
        photoR2Url: { type: 'string', required: false },
        selfIntro: { type: 'string', required: false },
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail({ to: email, url });
        },
        expiresIn: 60 * 15, // 15 minutes
      }),
    ],
  });
  return cached;
}
