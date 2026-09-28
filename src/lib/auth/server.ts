import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, genericOAuth } from 'better-auth/plugins';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { env, pingBridgeEnabled } from '../env';
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
        // Safe only while PingOne verifies emails at registration — a user
        // with an unverified Ping email must never link to an OTP account.
        trustedProviders: ['pingone'],
        // Users this bridge itself created carry email_verified=false
        // (PingOne userinfo has no email_verified claim), and PingOne subs
        // churn when the environment is recreated. Without this, re-linking
        // any such user dead-ends at account_not_linked.
        requireLocalEmailVerified: false,
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
      ...(pingBridgeEnabled(env())
        ? [
            genericOAuth({
              config: [
                {
                  // Session bridge only: the interactive auth happens through
                  // the @forgerock/oidc-client flow on the sign-in page; this
                  // provider rides the resulting PingOne session silently to
                  // mint the app session. Public client + PKCE, no secret.
                  providerId: 'pingone',
                  discoveryUrl: `https://auth.pingone.ca/${env().PING_ENV_ID}/as/.well-known/openid-configuration`,
                  clientId: env().PING_CLIENT_ID!,
                  scopes: ['openid', 'profile', 'email'],
                  pkce: true,
                  // PingOne's userinfo/ID token may omit `name`, which
                  // better-auth requires. Fall back to given+family name,
                  // then the email prefix (same rule as the OTP create hook).
                  mapProfileToUser: (profile) => {
                    const first = profile.given_name as string | undefined;
                    const last = profile.family_name as string | undefined;
                    const name =
                      (profile.name as string | undefined) ??
                      ([first, last].filter(Boolean).join(' ') ||
                        (profile.email as string | undefined)?.split('@')[0]);
                    // PingOne omits email_verified from userinfo, but our
                    // flow guarantees it: registration pairs the email as an
                    // MFA device and sign-in delivers an OTP to that inbox.
                    return { name, emailVerified: true };
                  },
                },
              ],
            }),
          ]
        : []),
    ],
  });
  return cached;
}
