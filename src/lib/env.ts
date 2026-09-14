import { z } from 'zod';

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    LLM_PROVIDER: z.enum(['anthropic', 'google', 'openai']).default('anthropic'),
    LLM_MODEL: z.string().default('claude-haiku-4-5'),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_PUBLIC_URL_BASE: z.string().url(),
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
    MAX_CAPTURES_PER_DAY: z.coerce.number().int().positive().default(50),
    BASE_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(16),
    BETTER_AUTH_URL: z.string().url(),
    PING_ENV_ID: z.string().optional(),
    PING_CLIENT_ID: z.string().optional(),
    PING_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.LLM_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'Required when LLM_PROVIDER is anthropic',
      });
    }
    if (data.LLM_PROVIDER === 'google' && !data.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
        message: 'Required when LLM_PROVIDER is google',
      });
    }
    if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'Required when LLM_PROVIDER is openai',
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function pingEnabled(e: Env): boolean {
  return Boolean(e.PING_ENV_ID && e.PING_CLIENT_ID && e.PING_CLIENT_SECRET);
}

// On a Vercel preview deployment, BETTER_AUTH_URL must equal the preview's own
// hostname — otherwise magic-link emails generated here will redirect back to
// production (where the user isn't authenticated for this code) and testing
// becomes impossible. Override the env-provided value automatically.
// In production: VERCEL_ENV='production' and we want the static BETTER_AUTH_URL.
// In local dev: no VERCEL_ENV — falls back to whatever's in .env.local.
function deriveBetterAuthUrl(raw: NodeJS.ProcessEnv): string | undefined {
  if (raw.VERCEL_ENV === 'preview' && raw.VERCEL_URL) {
    return `https://${raw.VERCEL_URL}`;
  }
  return raw.BETTER_AUTH_URL;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  // Skip validation during Next.js build (no real env vars available).
  // SKIP_ENV_VALIDATION is set automatically via next.config or can be set manually.
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return raw as unknown as Env;
  }
  const normalized = { ...raw, BETTER_AUTH_URL: deriveBetterAuthUrl(raw) };
  const result = schema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function resetEnvCache(): void {
  cached = undefined;
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
