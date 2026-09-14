import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, genericOAuth } from 'better-auth/plugins';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { env, pingEnabled } from '../env';
import { sendOTPEmail } from '../email/resend';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: any;

export function auth() {
  if (cached) return cached as ReturnType<typeof betterAuth>;
  cached = betterAuth({
    baseURL: env().BETTER_AUTH_URL,
    secret: env().BETTER_AUTH_SECRET,
    // Provider-denied OAuth callbacks (?error=...) redirect here before the
    // per-request errorCallbackURL in state is ever parsed — without this,
    // users land on Better Auth's raw /api/auth/error page.
    onAPIError: {
      errorURL: '/app/sign-in',
    },
    advanced: {
      database: {
        generateId: () => randomUUID(),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 365 days
      updateAge: 60 * 60 * 24,        // refresh the cookie's expiry every 24 h of activity
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
    databaseHooks: {
      user: {
        create: {
          before: async (user: { email?: string; name?: string }) => {
            if (!user.name && user.email) {
              user.name = user.email.split('@')[0];
            }
            return { data: user };
          },
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['pingone'],
      },
    },
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp }) => {
          await sendOTPEmail({ to: email, otp });
        },
        otpLength: 6,
        expiresIn: 60 * 10, // 10 minutes
      }),
      ...(pingEnabled(env())
        ? [
            genericOAuth({
              config: [
                {
                  providerId: 'pingone',
                  discoveryUrl: `https://auth.pingone.ca/${env().PING_ENV_ID}/as/.well-known/openid-configuration`,
                  clientId: env().PING_CLIENT_ID!,
                  clientSecret: env().PING_CLIENT_SECRET!,
                  scopes: ['openid', 'profile', 'email'],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
    ],
  });
  return cached;
}
