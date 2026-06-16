# PWA Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phone-first web app (`/app`) that lets anyone record a voice memo about a person they met, get a designed card, and share it via the OS native share sheet — backed by the same services as the v1 Telegram bot, with shared CRM.

**Architecture:** Add a magic-link email auth layer (Better Auth) on top of the existing Drizzle schema, generalize `processCapture` to accept web-uploaded audio in addition to Telegram-sourced media, and serve three new HTML routes — `/app/*` (PWA), `/c/<id>` (public card landing with vCard download), `/api/auth/*` (auth). The Telegram bot keeps working with no functional regression.

**Tech Stack:** Existing — TypeScript, Next.js 16, Drizzle, Neon, Inngest, Cloudflare R2, Satori. New — `better-auth`, `resend`, browser MediaRecorder + Web Share APIs.

**Working directory:** `/Users/timnan/Documents/GitHub/connectyall` on branch `feature/pwa-capture`.

**Spec reference:** `docs/superpowers/specs/2026-06-15-pwa-capture-design.md`.

---

## File Structure

```
connectyall/
├── drizzle/
│   ├── 0001_users_uuid_pk.sql              # NEW: data migration
│   └── XXXX_*.sql                           # drizzle-kit auto-generates the rest
├── src/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── server.ts                    # NEW: better-auth server instance
│   │   │   ├── client.ts                    # NEW: better-auth browser client
│   │   │   └── session.ts                   # NEW: getServerSession helper
│   │   ├── db/
│   │   │   ├── schema.ts                    # MODIFY: users PK uuid + email + interactions status + better-auth tables
│   │   │   └── client.ts                    # unchanged
│   │   ├── email/
│   │   │   └── resend.ts                    # NEW: send magic-link email
│   │   ├── r2/
│   │   │   └── client.ts                    # MODIFY: add uploadBytes(key, bytes, contentType)
│   │   ├── vcard.ts                         # NEW: pure function to build vCard 3.0
│   │   ├── env.ts                           # MODIFY: add RESEND_API_KEY etc.
│   │   └── telegram/
│   │       └── connect.ts                   # NEW: bot handler for /start link_<token>
│   ├── services/
│   │   ├── UserProfileService.ts           # MODIFY: add getById/getByEmail; queries use users.id (uuid)
│   │   ├── ContactService.ts               # MODIFY: userId is uuid; getInteractionWithContact returns uuid user
│   │   ├── CaptureService.ts               # MODIFY: generalize processCapture inputs
│   │   ├── InteractionService.ts           # NEW: mintStub, markReady, markFailed
│   │   └── TelegramLinkService.ts          # NEW: issue/verify connect-telegram tokens
│   └── app/
│       ├── api/
│       │   ├── auth/
│       │   │   └── [...all]/route.ts        # NEW: better-auth catch-all handler
│       │   ├── capture/
│       │   │   └── route.ts                 # NEW: POST upload + enqueue
│       │   ├── cards/
│       │   │   └── [id]/route.ts            # NEW: GET status + card data
│       │   ├── profile/
│       │   │   └── route.ts                 # NEW: PUT update profile
│       │   ├── telegram/                    # unchanged
│       │   └── inngest/                     # unchanged
│       ├── app/                             # PWA shell — note the directory IS named "app"
│       │   ├── layout.tsx                   # NEW: PWA shell layout
│       │   ├── page.tsx                     # NEW: auth gate + redirect
│       │   ├── sign-in/page.tsx             # NEW: email magic-link form
│       │   ├── record/page.tsx              # NEW: tap-to-toggle recording UI
│       │   ├── cards/page.tsx               # NEW: recent cards list
│       │   ├── cards/[id]/page.tsx          # NEW: post-capture share screen
│       │   └── profile/page.tsx             # NEW: profile + Connect Telegram
│       ├── c/
│       │   └── [id]/
│       │       ├── page.tsx                 # NEW: public card landing
│       │       └── vcard/route.ts           # NEW: vCard download
│       ├── layout.tsx                       # unchanged
│       └── page.tsx                         # unchanged (existing marketing landing)
```

---

## New env vars (added in Task 1)

| Var | Source | Purpose |
|---|---|---|
| `RESEND_API_KEY` | resend.com | magic-link email delivery |
| `RESEND_FROM_EMAIL` | configurable | sender, e.g. `Connectyall <auth@connectyall.app>` |
| `BETTER_AUTH_SECRET` | generate 32 random bytes | session cookie signing |
| `BETTER_AUTH_URL` | per env | base URL for callbacks (`http://localhost:3000` or `https://connectyall.vercel.app`) |

---

## Tasks

### Task 1: Install new deps + env scaffolding

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `.env.example`
- Modify: `.env.test.local`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
pnpm add better-auth resend
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D @better-auth/cli
```

- [ ] **Step 3: Extend env schema with new vars**

In `src/lib/env.ts`, add to the zod schema (preserving the existing entries):

```ts
RESEND_API_KEY: z.string().min(1),
RESEND_FROM_EMAIL: z.string().min(1),
BETTER_AUTH_SECRET: z.string().min(16),
BETTER_AUTH_URL: z.string().url(),
```

- [ ] **Step 4: Add test sentinels**

Append to `.env.test.local`:

```
RESEND_API_KEY=test-resend-key
RESEND_FROM_EMAIL=Connectyall <auth@example.test>
BETTER_AUTH_SECRET=test-secret-thirty-two-chars-1234567890ab
BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 5: Append empty entries to `.env.example`**

```
RESEND_API_KEY=
RESEND_FROM_EMAIL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
```

- [ ] **Step 6: Verify env tests still pass**

```bash
pnpm exec vitest run src/lib/env.test.ts
```

Expected: all existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/env.ts .env.example .env.test.local
git commit -m "chore: install better-auth + resend + extend env schema"
```

---

### Task 2: Schema migration — users PK to uuid + email + interactions.status

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0001_users_uuid_pk.sql` (hand-written, replaces auto-generated)

- [ ] **Step 1: Update schema**

Replace the `users` table definition in `src/lib/db/schema.ts`:

```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
  telegramUsername: text('telegram_username'),
  displayName: text('display_name').notNull(),
  tagline: text('tagline'),
  photoR2Url: text('photo_r2_url'),
  selfIntro: text('self_intro'),
  socials: jsonb('socials').$type<Socials>().default({}).notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  consentAcknowledgedAt: timestamp('consent_acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_unique').on(t.email),
  telegramIdx: uniqueIndex('users_telegram_user_id_unique').on(t.telegramUserId),
}));
```

Add `uniqueIndex` to the `drizzle-orm/pg-core` import at top of file.

Replace the `contacts.userId` definition (still inside the contacts pgTable):

```ts
userId: uuid('user_id')
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),
```

Replace the `interactions` definition:

```ts
export const interactionStatusEnum = pgEnum('interaction_status', ['processing', 'ready', 'failed']);

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    structuredData: jsonb('structured_data').notNull(),
    status: interactionStatusEnum('status').default('ready').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    contactIdx: index('interactions_contact_id_idx').on(t.contactId),
  })
);
```

(contactId loses `.notNull()`. status enum is new.)

Also update the type exports — Drizzle infers them so no manual change needed.

- [ ] **Step 2: Generate a Drizzle migration (we will overwrite it)**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
DATABASE_URL=postgres://test:test@localhost:5432/test pnpm db:generate
```

Expected: `drizzle/0001_*.sql` is created. We will overwrite its contents in the next step because drizzle-kit can't express the PK swap + FK rewire atomically.

- [ ] **Step 3: Overwrite with hand-written migration**

Rename the generated file to `drizzle/0001_users_uuid_pk.sql` and replace its contents with:

```sql
-- 1. New enum
CREATE TYPE "public"."interaction_status" AS ENUM('processing', 'ready', 'failed');

-- 2. Add new user columns (still keep old PK column)
ALTER TABLE "users" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();
UPDATE "users" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "users" ADD COLUMN "email" text;
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;

-- 3. Rebuild contacts.user_id to point at users.id
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_user_id_users_telegram_user_id_fk";
ALTER TABLE "contacts" ADD COLUMN "user_id_new" uuid;
UPDATE "contacts" SET "user_id_new" = (SELECT "id" FROM "users" WHERE "users"."telegram_user_id" = "contacts"."user_id");
ALTER TABLE "contacts" ALTER COLUMN "user_id_new" SET NOT NULL;
ALTER TABLE "contacts" DROP COLUMN "user_id";
ALTER TABLE "contacts" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "contacts_user_id_idx" ON "contacts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "contacts_user_name_idx" ON "contacts" USING btree ("user_id","name");
CREATE INDEX IF NOT EXISTS "contacts_user_id_last_touched_idx" ON "contacts" USING btree ("user_id","last_touched_at");

-- 4. Swap users PK
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";
ALTER TABLE "users" ADD PRIMARY KEY ("id");

-- 5. Add unique indexes for email + telegram_user_id
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users"("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_user_id_unique" ON "users"("telegram_user_id") WHERE "telegram_user_id" IS NOT NULL;

-- 6. Interactions changes — relax contact_id, add status enum
ALTER TABLE "interactions" ALTER COLUMN "contact_id" DROP NOT NULL;
ALTER TABLE "interactions" ADD COLUMN "status" "public"."interaction_status" DEFAULT 'ready' NOT NULL;
```

Also remove drizzle's auto-generated `_journal.json` entry pointing to the bogus filename and add an entry for the new filename — open `drizzle/meta/_journal.json` and:
- Find the latest entry (the one drizzle-kit just added)
- Rename its `tag` field to `0001_users_uuid_pk`
- Update `idx` accordingly if needed

- [ ] **Step 4: Apply the migration locally if you have a local Neon (skip if not)**

Skip this step locally. Migration runs against Neon at deploy time.

- [ ] **Step 5: Typecheck + unit tests still pass**

```bash
pnpm typecheck
pnpm exec vitest run src/lib/db/schema.test.ts
```

The existing schema test (`users table has required columns`) checks for `displayName`, `socials`, `createdAt`. It does NOT check for `telegramUserId` so the rename is fine. Both must pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(schema): users.id uuid PK + email + interactions.status enum"
```

---

### Task 3: Better Auth schema additions

**Files:**
- Modify: `src/lib/db/schema.ts`

Better Auth ships a CLI that generates Drizzle schema. We'll hand-write the tables it needs (sessions, accounts, verifications) to keep the migration deterministic.

- [ ] **Step 1: Append Better Auth tables to schema**

Append to `src/lib/db/schema.ts`:

```ts
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

```bash
DATABASE_URL=postgres://test:test@localhost:5432/test pnpm db:generate
```

Expected: `drizzle/0002_*.sql` created with CREATE TABLE statements for `sessions`, `accounts`, `verifications`, `telegram_link_tokens`. Inspect to confirm.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(schema): better-auth tables + telegram_link_tokens"
```

---

### Task 4: Better Auth server config + email module

**Files:**
- Create: `src/lib/email/resend.ts`
- Create: `src/lib/auth/server.ts`

- [ ] **Step 1: Resend email helper**

Create `src/lib/email/resend.ts`:

```ts
import { Resend } from 'resend';
import { env } from '../env';

let cached: Resend | undefined;
function client() {
  if (!cached) cached = new Resend(env().RESEND_API_KEY);
  return cached;
}

export async function sendMagicLinkEmail(input: { to: string; url: string }): Promise<void> {
  const { from } = { from: env().RESEND_FROM_EMAIL };
  await client().emails.send({
    from,
    to: input.to,
    subject: 'Your Connectyall sign-in link',
    text: `Hi,\n\nClick the link below to sign in to Connectyall:\n\n${input.url}\n\nThis link expires in 15 minutes. If you didn't request this, ignore the email.\n\n— Connectyall`,
    html: `<div style="font-family:system-ui;line-height:1.5;color:#111"><p>Hi,</p><p>Click the button below to sign in to Connectyall:</p><p><a href="${input.url}" style="display:inline-block;padding:10px 16px;background:#0E7C7B;color:#fff;text-decoration:none;border-radius:6px">Sign in</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore the email.</p><p style="color:#666;font-size:13px">— Connectyall</p></div>`,
  });
}
```

- [ ] **Step 2: Better Auth server**

Create `src/lib/auth/server.ts`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { env } from '../env';
import { sendMagicLinkEmail } from '../email/resend';

let cached: ReturnType<typeof betterAuth> | undefined;

export function auth() {
  if (cached) return cached;
  cached = betterAuth({
    baseURL: env().BETTER_AUTH_URL,
    secret: env().BETTER_AUTH_SECRET,
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
      additionalFields: {
        // Mark our domain-specific columns as managed by us, not by better-auth's create flow.
        telegramUserId: { type: 'number', required: false },
        telegramUsername: { type: 'string', required: false },
        displayName: { type: 'string', required: false },
        tagline: { type: 'string', required: false },
        photoR2Url: { type: 'string', required: false },
        selfIntro: { type: 'string', required: false },
        socials: { type: 'string', required: false },
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
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth src/lib/email
git commit -m "feat(auth): better-auth server config with magic-link via Resend"
```

---

### Task 5: Better Auth client + session helper + catch-all route

**Files:**
- Create: `src/lib/auth/client.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Browser client**

Create `src/lib/auth/client.ts`:

```ts
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 2: Server session helper**

Create `src/lib/auth/session.ts`:

```ts
import { headers } from 'next/headers';
import { auth } from './server';

export async function getServerSession(): Promise<
  | { user: { id: string; email: string | null; emailVerified: boolean }; sessionId: string }
  | null
> {
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      emailVerified: session.user.emailVerified ?? false,
    },
    sessionId: session.session.id,
  };
}
```

- [ ] **Step 3: Auth catch-all route**

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/server';

export const { POST, GET } = toNextJsHandler(auth());
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth src/app/api/auth
git commit -m "feat(auth): client + session helper + Next.js catch-all route"
```

---

### Task 6: Update UserProfileService for uuid identity

**Files:**
- Modify: `src/services/UserProfileService.ts`
- Modify: `src/services/UserProfileService.test.ts`

`UserProfileService` currently uses `telegramUserId` as the lookup key. Generalize it: keep `telegramUserId`-keyed lookups for the bot, add `id`-keyed lookups for the web, and a `getByEmail` for sign-in flows.

- [ ] **Step 1: Add failing tests**

Append to `src/services/UserProfileService.test.ts`:

```ts
it('getById returns the user when found', async () => {
  limitMock.mockResolvedValueOnce([{ id: 'uuid-1', displayName: 'Tim' }]);
  const user = await getById('uuid-1');
  expect(user?.displayName).toBe('Tim');
});

it('getById returns null when empty', async () => {
  limitMock.mockResolvedValueOnce([]);
  const user = await getById('nonexistent');
  expect(user).toBeNull();
});

it('getByEmail returns the user when found', async () => {
  limitMock.mockResolvedValueOnce([{ id: 'uuid-1', email: 'tim@example.com' }]);
  const user = await getByEmail('tim@example.com');
  expect(user?.id).toBe('uuid-1');
});
```

Update the imports at the top of the test file to include `getById, getByEmail`.

- [ ] **Step 2: Run test to see failures**

```bash
pnpm exec vitest run src/services/UserProfileService.test.ts
```

Expected: 3 new failures (`getById is not defined`, `getByEmail is not defined`).

- [ ] **Step 3: Implement the new lookups + rename existing**

Modify `src/services/UserProfileService.ts`. Rename `getProfile` to `getByTelegramUserId` and add the two new functions. Update all internal references in this file (e.g., `setSocial` calls into the contacts table not the users table — but the user lookup inside it needs adjustment).

Replace the file's existing exports with:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users, type Socials, type User, type NewUser } from '../lib/db/schema';
import { uploadPhoto } from '../lib/r2/client';
import { env } from '../lib/env';
import { sql } from 'drizzle-orm';

export async function getById(id: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getByTelegramUserId(telegramUserId: number): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
  return rows[0] ?? null;
}

export async function getByEmail(email: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

// Legacy alias for bot code paths that haven't migrated yet.
export const getProfile = getByTelegramUserId;

export type UpsertProfileInput = Pick<NewUser, 'displayName'> &
  Partial<Pick<NewUser, 'telegramUserId' | 'telegramUsername' | 'tagline' | 'selfIntro' | 'id' | 'email'>>;

export async function upsertProfile(input: UpsertProfileInput): Promise<User> {
  // When telegramUserId is provided, upsert on telegramUserId (bot flow).
  // When id is provided, update by id (web flow).
  if (input.telegramUserId !== undefined && input.telegramUserId !== null) {
    const [row] = await db()
      .insert(users)
      .values({
        displayName: input.displayName,
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername ?? null,
        tagline: input.tagline ?? null,
        selfIntro: input.selfIntro ?? null,
      })
      .onConflictDoUpdate({
        target: users.telegramUserId,
        set: {
          displayName: input.displayName,
          telegramUsername: input.telegramUsername ?? null,
          tagline: input.tagline ?? null,
          selfIntro: input.selfIntro ?? null,
        },
      })
      .returning();
    return row;
  }
  if (!input.id) throw new Error('upsertProfile requires either telegramUserId or id');
  const [row] = await db()
    .update(users)
    .set({
      displayName: input.displayName,
      tagline: input.tagline ?? null,
      selfIntro: input.selfIntro ?? null,
    })
    .where(eq(users.id, input.id))
    .returning();
  return row;
}

export async function setSocial(
  userId: string,
  kind: keyof Socials,
  value: string
): Promise<void> {
  await db()
    .update(users)
    .set({ socials: sql`${users.socials} || ${JSON.stringify({ [kind]: value })}::jsonb` })
    .where(eq(users.id, userId));
}

export async function setPhotoFromTelegram(
  userId: string,
  telegramFileId: string
): Promise<string> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const meta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${telegramFileId}`)
    .then((r) => r.json() as Promise<{ ok: boolean; result: { file_path: string } }>);
  if (!meta.ok) throw new Error('Telegram getFile failed');

  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  const bytes = new Uint8Array(await fileRes.arrayBuffer());

  const ext = meta.result.file_path.split('.').pop() ?? 'jpg';
  const url = await uploadPhoto({
    key: `profiles/${userId}.${ext}`,
    bytes,
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
  });

  await db().update(users).set({ photoR2Url: url }).where(eq(users.id, userId));
  return url;
}

export async function setPhotoFromBytes(
  userId: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const url = await uploadPhoto({
    key: `profiles/${userId}.${ext}`,
    bytes,
    contentType,
  });
  await db().update(users).set({ photoR2Url: url }).where(eq(users.id, userId));
  return url;
}
```

- [ ] **Step 4: Update the existing tests for the new signatures**

The existing `setPhotoFromTelegram` test calls `setPhotoFromTelegram(1, 'AgAC...')` — now it expects `(userId: string, fileId)`. Update the test call:

```ts
const url = await setPhotoFromTelegram('user-uuid-1', 'AgAC...');
```

The `getProfile` test still works because `getProfile` is a re-export of `getByTelegramUserId`. The `upsertProfile` test still works because telegramUserId path is preserved.

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run src/services/UserProfileService.test.ts
```

Expected: PASS (6/6 — existing 4 + 2 new for getById/getByEmail; the third new test for `setSocial` is unchanged in behavior).

- [ ] **Step 6: Update any caller signatures**

Run typecheck:

```bash
pnpm typecheck
```

Expected: errors in `src/lib/telegram/onboarding.ts` and `src/services/CaptureService.ts` because they call `setSocial(ctx.from!.id, ...)` and `setPhotoFromTelegram(ctx.from!.id, ...)` with a number, not a uuid.

Fix these by doing the bot-side lookup: for the bot context, look up the user by telegramUserId to get the uuid `id`, then pass that.

In `src/lib/telegram/onboarding.ts`, wherever `setSocial(ctx.from!.id, ...)` or `setPhotoFromTelegram(ctx.from!.id, ...)` appears, replace with:

```ts
const profile = await getByTelegramUserId(ctx.from!.id);
if (!profile) return;
await setSocial(profile.id, kind, text);
```

(and the analogous change for `setPhotoFromTelegram`).

Run typecheck again until clean.

- [ ] **Step 7: Commit**

```bash
git add src/services/UserProfileService.ts src/services/UserProfileService.test.ts src/lib/telegram/onboarding.ts
git commit -m "refactor(profile): users keyed by uuid; bot path translates telegramUserId"
```

---

### Task 7: Update ContactService for uuid userId

**Files:**
- Modify: `src/services/ContactService.ts`
- Modify: `src/services/ContactService.test.ts`

The only semantic change: `userId` parameter type is `string` (uuid) instead of `number`. Drizzle's type inference already handles the FK type after the schema migration.

- [ ] **Step 1: Update signatures**

In `src/services/ContactService.ts`, change every function signature where `userId: number` → `userId: string`. Specifically:
- `createContact(input: NewContact)` — no change, Drizzle infers
- `findByNameAndCompany(userId: string, name, company)`
- `listContacts(userId: string, opts)`

The body's `eq(contacts.userId, userId)` calls compile against the new schema's uuid column.

- [ ] **Step 2: Update tests**

In `src/services/ContactService.test.ts`, update mocked calls:

```ts
await createContact({ userId: 'user-uuid-1', name: 'Sarah', ... });
const found = await findByNameAndCompany('user-uuid-1', 'sarah chen', 'acme');
```

- [ ] **Step 3: Run tests + typecheck**

```bash
pnpm exec vitest run src/services/ContactService.test.ts
pnpm typecheck
```

Expected: PASS + clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/ContactService.ts src/services/ContactService.test.ts
git commit -m "refactor(contacts): userId is now uuid (string)"
```

---

### Task 8: InteractionService — pre-mint stub + status transitions

**Files:**
- Create: `src/services/InteractionService.ts`
- Create: `src/services/InteractionService.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/services/InteractionService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertReturning = vi.fn();
const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
const insertMock = vi.fn().mockReturnValue({ values: insertValues });

const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
const updateMock = vi.fn().mockReturnValue({ set: updateSet });

const selectLimit = vi.fn();
const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const selectMock = vi.fn().mockReturnValue({ from: selectFrom });

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, update: updateMock, select: selectMock }),
}));

import { mintStub, markReady, markFailed, getStatus } from './InteractionService';

describe('InteractionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mintStub inserts a processing row and returns id', async () => {
    insertReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    const id = await mintStub('voice');
    expect(id).toBe('int-1');
    expect(insertMock).toHaveBeenCalled();
  });

  it('markReady updates contactId, structuredData, status', async () => {
    await markReady('int-1', 'contact-1', { recap: 'hi' });
    expect(updateMock).toHaveBeenCalled();
  });

  it('markFailed updates status to failed', async () => {
    await markFailed('int-1');
    expect(updateMock).toHaveBeenCalled();
  });

  it('getStatus returns the row', async () => {
    selectLimit.mockResolvedValueOnce([{ id: 'int-1', status: 'ready' }]);
    const r = await getStatus('int-1');
    expect(r?.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm exec vitest run src/services/InteractionService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/services/InteractionService.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { interactions, type NewInteraction } from '../lib/db/schema';

export async function mintStub(source: NewInteraction['source']): Promise<string> {
  const [row] = await db()
    .insert(interactions)
    .values({
      source,
      structuredData: {},
      status: 'processing',
    })
    .returning({ id: interactions.id });
  return row.id;
}

export async function markReady(
  interactionId: string,
  contactId: string,
  structuredData: unknown
): Promise<void> {
  await db()
    .update(interactions)
    .set({ contactId, structuredData, status: 'ready' })
    .where(eq(interactions.id, interactionId));
}

export async function markFailed(interactionId: string): Promise<void> {
  await db()
    .update(interactions)
    .set({ status: 'failed' })
    .where(eq(interactions.id, interactionId));
}

export async function getStatus(interactionId: string): Promise<{ id: string; status: 'processing' | 'ready' | 'failed'; contactId: string | null; structuredData: unknown } | null> {
  const rows = await db()
    .select({
      id: interactions.id,
      status: interactions.status,
      contactId: interactions.contactId,
      structuredData: interactions.structuredData,
    })
    .from(interactions)
    .where(eq(interactions.id, interactionId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run src/services/InteractionService.test.ts
pnpm typecheck
```

Expected: PASS (4/4) + clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/InteractionService.ts src/services/InteractionService.test.ts
git commit -m "feat: InteractionService for web pre-mint + status transitions"
```

---

### Task 9: TelegramLinkService — connect-telegram tokens

**Files:**
- Create: `src/services/TelegramLinkService.ts`
- Create: `src/services/TelegramLinkService.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/services/TelegramLinkService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn().mockReturnValue({ values: insertValues });
const selectLimit = vi.fn();
const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const selectMock = vi.fn().mockReturnValue({ from: selectFrom });
const deleteWhere = vi.fn().mockResolvedValue(undefined);
const deleteMock = vi.fn().mockReturnValue({ where: deleteWhere });
const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const updateMock = vi.fn().mockReturnValue({ set: updateSet });

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, select: selectMock, delete: deleteMock, update: updateMock }),
}));

import { issueLinkToken, consumeLinkToken } from './TelegramLinkService';

describe('TelegramLinkService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issueLinkToken inserts a row and returns a token', async () => {
    const token = await issueLinkToken('user-1');
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(insertMock).toHaveBeenCalled();
  });

  it('consumeLinkToken sets users.telegramUserId and deletes the token row', async () => {
    selectLimit.mockResolvedValueOnce([{ token: 'abc', userId: 'user-1', expiresAt: new Date(Date.now() + 60000) }]);
    const ok = await consumeLinkToken('abc', 42, 'sarah');
    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
  });

  it('consumeLinkToken returns false for unknown token', async () => {
    selectLimit.mockResolvedValueOnce([]);
    const ok = await consumeLinkToken('bad', 42, 'sarah');
    expect(ok).toBe(false);
  });

  it('consumeLinkToken returns false for expired token', async () => {
    selectLimit.mockResolvedValueOnce([{ token: 'abc', userId: 'user-1', expiresAt: new Date(Date.now() - 60000) }]);
    const ok = await consumeLinkToken('abc', 42, 'sarah');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm exec vitest run src/services/TelegramLinkService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/services/TelegramLinkService.ts`:

```ts
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../lib/db/client';
import { telegramLinkTokens, users } from '../lib/db/schema';

const TOKEN_TTL_SECONDS = 60 * 10; // 10 minutes

export async function issueLinkToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(16).toString('hex');
  await db()
    .insert(telegramLinkTokens)
    .values({
      token,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
    });
  return token;
}

export async function consumeLinkToken(
  token: string,
  telegramUserId: number,
  telegramUsername: string | null
): Promise<boolean> {
  const rows = await db()
    .select({ userId: telegramLinkTokens.userId, expiresAt: telegramLinkTokens.expiresAt })
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;
  await db()
    .update(users)
    .set({ telegramUserId, telegramUsername })
    .where(eq(users.id, row.userId));
  await db().delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token));
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run src/services/TelegramLinkService.test.ts
pnpm typecheck
```

Expected: PASS (4/4) + clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/TelegramLinkService.ts src/services/TelegramLinkService.test.ts
git commit -m "feat: TelegramLinkService for connect-telegram tokens"
```

---

### Task 10: R2 client — add uploadBytes alias

**Files:**
- Modify: `src/lib/r2/client.ts`
- Modify: `src/lib/r2/client.test.ts`

The existing `uploadPhoto` function already does what we need; we just want a more general-named alias for audio uploads.

- [ ] **Step 1: Add a test that exercises uploadBytes**

Append to `src/lib/r2/client.test.ts`:

```ts
import { uploadBytes } from './client';

it('uploadBytes is an alias for uploadPhoto', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const url = await uploadBytes({ key: 'captures/test.webm', bytes, contentType: 'audio/webm' });
  expect(url).toBe('https://pub-test.r2.dev/captures/test.webm');
});
```

- [ ] **Step 2: Add the export**

Append to `src/lib/r2/client.ts`:

```ts
export const uploadBytes = uploadPhoto;
```

- [ ] **Step 3: Run + commit**

```bash
pnpm exec vitest run src/lib/r2/client.test.ts
git add src/lib/r2/client.ts src/lib/r2/client.test.ts
git commit -m "chore(r2): expose uploadBytes alias for non-photo content"
```

---

### Task 11: CaptureService — generalize processCapture

**Files:**
- Modify: `src/services/CaptureService.ts`
- Modify: `src/services/CaptureService.test.ts`

Refactor so the function accepts either a Telegram file_id or an inline R2 key, and either replies to a Telegram chat or marks an interaction row ready (for web polling).

- [ ] **Step 1: Read the current file**

Open `src/services/CaptureService.ts` and confirm the current `CaptureInput` type. Current shape (Task 16 of v1 plan):

```ts
type CaptureInput = {
  userId: number;        // telegram_user_id
  chatId: number;
  fileId: string;
  mimeType: string;
  kind: 'voice' | 'audio' | 'video';
};
```

- [ ] **Step 2: New CaptureInput shape**

Replace the type definition with:

```ts
type CaptureInput = {
  userId: string;        // users.id uuid
  source: 'telegram-voice' | 'telegram-audio' | 'telegram-video' | 'web';
  audio:
    | { kind: 'telegram-file'; fileId: string; mimeType: string }
    | { kind: 'r2-key'; key: string; mimeType: string };
  preMintedInteractionId?: string;
  replyTo:
    | { surface: 'telegram'; chatId: number }
    | { surface: 'web' };
};
```

- [ ] **Step 3: Add a download path for R2-key audio**

Add a helper near the existing `downloadTelegramFile`:

```ts
async function downloadFromR2(key: string): Promise<Uint8Array> {
  const url = `${env().R2_PUBLIC_URL_BASE}/${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
```

- [ ] **Step 4: Rewrite processCapture**

Replace the body to switch on `audio.kind` and `replyTo.surface`:

```ts
export async function processCapture(input: CaptureInput): Promise<void> {
  const count = await capturesInLast24h(input.userId);
  if (count >= env().MAX_CAPTURES_PER_DAY) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, `Daily limit hit (${env().MAX_CAPTURES_PER_DAY} captures). Try again tomorrow.`);
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  const profile = await getById(input.userId);
  if (!profile) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Your profile isn't set up yet.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  await db().insert(usageEvents).values({ userId: input.userId, kind: 'capture' });

  const audio = input.audio.kind === 'telegram-file'
    ? await downloadTelegramFile(input.audio.fileId)
    : await downloadFromR2(input.audio.key);

  const transcript = await transcribe(audio);

  if (!transcript.trim()) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Couldn't make out clear contact info.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  const extraction = await extract({ transcript, selfIntro: profile.selfIntro });

  if (extraction.contacts.length === 0) {
    if (input.replyTo.surface === 'telegram') {
      await sendMessage({ chatId: input.replyTo.chatId }, "Got the notes but couldn't pin down a name.");
    } else if (input.preMintedInteractionId) {
      await markFailed(input.preMintedInteractionId);
    }
    return;
  }

  // Map the source string back to the legacy kind for the interactions.source enum
  const sourceKind: 'voice' | 'audio' | 'video' | 'manual' =
    input.source === 'telegram-voice' ? 'voice'
    : input.source === 'telegram-audio' ? 'audio'
    : input.source === 'telegram-video' ? 'video'
    : 'voice'; // web → voice

  for (const c of extraction.contacts) {
    const contact = await ensureContact(input.userId, c);

    const png = await renderCard({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        photoR2Url: profile.photoR2Url,
        socials: profile.socials,
      },
      contactName: c.name,
      recap: c.recap,
    });

    const caption = buildCaption({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        socials: profile.socials,
      },
      contactName: c.name,
      recap: c.recap,
    });

    let interactionId: string;
    let photoFileId: string | null = null;

    if (input.replyTo.surface === 'telegram') {
      const sent = await sendPhoto({ chatId: input.replyTo.chatId }, png, caption);
      photoFileId = sent.photoFileId;
      interactionId = await addInteraction(contact.id, sourceKind, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: photoFileId,
      });
    } else {
      interactionId = input.preMintedInteractionId ?? await addInteraction(contact.id, sourceKind, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: null,
      });
      await markReady(interactionId, contact.id, {
        ...c,
        was_live_recording: extraction.was_live_recording,
        photo_file_id: null,
      });
    }

    await uploadBytes({
      key: `cards/${interactionId}.png`,
      bytes: new Uint8Array(png),
      contentType: 'image/png',
    });

    if (input.replyTo.surface === 'telegram') {
      const handle = c.links.telegram?.replace(/^@/, '');
      const sendButton = {
        text: handle ? `📨 Send to @${handle}` : '📨 Send to someone',
        switch_inline_query_chosen_chat: { query: interactionId, allow_user_chats: true },
      };
      const fixButton = {
        text: handle ? `✏️ Wrong handle? Fix @${handle}` : `✏️ Add Telegram handle for ${c.name}`,
        callback_data: `fix:${interactionId}`,
      };
      const replyMarkup = handle
        ? {
            inline_keyboard: [
              [sendButton],
              [{ text: `Open chat with @${handle}`, url: `https://t.me/${handle}` }],
              [fixButton],
            ],
          }
        : { inline_keyboard: [[sendButton], [fixButton]] };

      await sendMessage(
        { chatId: input.replyTo.chatId },
        handle ? `Forward this card to @${handle} 👇` : `Forward this card to ${c.name} 👇`,
        { replyMarkup }
      );
    }
  }
}
```

Make sure to add the new imports at the top:

```ts
import { getById } from './UserProfileService';
import { markReady, markFailed } from './InteractionService';
import { uploadBytes } from '../lib/r2/client';
```

(Remove the now-unused `import { getProfile } from './UserProfileService'` if it appears.)

- [ ] **Step 5: Update CaptureService.test.ts**

The existing tests use `getProfile` mock and pass `userId: 1, chatId: 1, fileId: 'F', mimeType: 'audio/ogg', kind: 'voice'`. Update mocks + calls:

- Replace `getProfileMock` → `getByIdMock` and mock module path `./UserProfileService` to export `getById: getByIdMock`.
- Mock the new `./InteractionService` module: `markReady`, `markFailed`.
- Mock `../lib/r2/client` to also export `uploadBytes` (alias for existing `uploadPhotoMock`).
- Update each `processCapture` call:
  ```ts
  await processCapture({
    userId: 'user-uuid-1',
    source: 'telegram-voice',
    audio: { kind: 'telegram-file', fileId: 'F', mimeType: 'audio/ogg' },
    replyTo: { surface: 'telegram', chatId: 1 },
  });
  ```

- [ ] **Step 6: Run tests + typecheck**

```bash
pnpm exec vitest run src/services/CaptureService.test.ts
pnpm typecheck
```

Expected: PASS (3/3) + clean. Existing telegram caller in `src/lib/telegram/capture.ts` will break the typecheck — fix in next step.

- [ ] **Step 7: Update bot capture handler**

Open `src/lib/telegram/capture.ts`. The current `inngest.send` calls pass `{ userId: ctx.from!.id, chatId, fileId, mimeType, kind }` directly. Now we need to look up the uuid `id` from `telegramUserId` before sending, AND restructure the payload.

Replace the body of each of the three handlers (voice/audio/video) to look like:

```ts
bot().on('voice', async (ctx) => {
  if ((ctx.message.voice.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  const profile = await getByTelegramUserId(ctx.from!.id);
  if (!profile) {
    await ctx.reply("Your profile isn't set up yet. Run /start first.");
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: profile.id,
      source: 'telegram-voice',
      audio: { kind: 'telegram-file', fileId: ctx.message.voice.file_id, mimeType: ctx.message.voice.mime_type ?? 'audio/ogg' },
      replyTo: { surface: 'telegram', chatId: ctx.chat.id },
    },
  });
});
```

(Repeat for `audio` and `video`, with `source: 'telegram-audio'` / `'telegram-video'` and the matching mime defaults.)

Add the import:

```ts
import { getByTelegramUserId } from '@/services/UserProfileService';
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/services/CaptureService.ts src/services/CaptureService.test.ts src/lib/telegram/capture.ts
git commit -m "refactor(capture): generalize processCapture inputs for web + bot"
```

---

### Task 12: `/api/capture` route

**Files:**
- Create: `src/app/api/capture/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/capture/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from '@/lib/auth/session';
import { uploadBytes } from '@/lib/r2/client';
import { mintStub } from '@/services/InteractionService';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/webm'];

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'audio too large (>20MB)' }, { status: 400 });
  if (!ALLOWED_MIME.includes(file.type)) return NextResponse.json({ error: `unsupported mime: ${file.type}` }, { status: 400 });

  const ext = file.type.split('/').pop() ?? 'webm';
  const key = `captures/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await uploadBytes({ key, bytes, contentType: file.type });

  const interactionId = await mintStub('voice');

  await inngest.send({
    name: 'capture/process',
    data: {
      userId: session.user.id,
      source: 'web',
      audio: { kind: 'r2-key', key, mimeType: file.type },
      preMintedInteractionId: interactionId,
      replyTo: { surface: 'web' },
    },
  });

  return NextResponse.json({ interactionId });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/capture
git commit -m "feat(api): /api/capture — auth + R2 upload + mint stub + enqueue"
```

---

### Task 13: `/api/cards/[id]` polling route

**Files:**
- Create: `src/app/api/cards/[id]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/cards/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getStatus } from '@/services/InteractionService';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { buildCaption } from '@/services/CardService';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const stub = await getStatus(id);
  if (!stub) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (stub.status !== 'ready') {
    return NextResponse.json({ status: stub.status });
  }

  const found = await getInteractionWithContact(id);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { interaction, contact } = found;

  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const profile = await getById(session.user.id);
  if (!profile) return NextResponse.json({ error: 'profile missing' }, { status: 500 });

  const structured = interaction.structuredData as { recap?: string; links?: { telegram?: string } } | null;
  const recap = structured?.recap ?? '';
  const caption = buildCaption({
    profile: {
      displayName: profile.displayName,
      tagline: profile.tagline,
      telegramUsername: profile.telegramUsername,
      socials: profile.socials,
    },
    contactName: contact.name,
    recap,
  });

  return NextResponse.json({
    status: 'ready',
    interaction: { id: interaction.id, recap },
    contact: { id: contact.id, name: contact.name, telegram: structured?.links?.telegram ?? null },
    cardUrl: `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`,
    caption,
    shareUrl: `${env().BASE_URL}/c/${interaction.id}`,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cards
git commit -m "feat(api): /api/cards/[id] polling endpoint"
```

---

### Task 14: `/api/profile` PUT route

**Files:**
- Create: `src/app/api/profile/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/profile/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { upsertProfile, setSocial, setPhotoFromBytes } from '@/services/UserProfileService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
  tagline: z.string().max(140).nullable().optional(),
  selfIntro: z.string().max(280).nullable().optional(),
});

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return NextResponse.json({ error: 'photo file required' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await setPhotoFromBytes(session.user.id, bytes, file.type);
    return NextResponse.json({ photoR2Url: url });
  }

  const body = await req.json();
  if (body.social && body.value) {
    await setSocial(session.user.id, body.social, body.value);
    return NextResponse.json({ ok: true });
  }
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => `${i.path}: ${i.message}`).join('; ') }, { status: 400 });
  }
  const user = await upsertProfile({ id: session.user.id, ...parsed.data });
  return NextResponse.json({ user });
}
```

- [ ] **Step 2: Commit**

```bash
pnpm typecheck
git add src/app/api/profile
git commit -m "feat(api): /api/profile PUT — name/tagline/photo/socials"
```

---

### Task 15: PWA shell — layout + sign-in page

**Files:**
- Create: `src/app/app/layout.tsx`
- Create: `src/app/app/sign-in/page.tsx`
- Create: `src/app/app/page.tsx`

- [ ] **Step 1: PWA shell layout**

Create `src/app/app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Connectyall',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Sign-in page**

Create `src/app/app/sign-in/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      await signIn.magicLink({ email, callbackURL: '/app' });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold">Connectyall</h1>
          <p className="text-neutral-400 text-sm">Voice memo → designed card → share to anyone.</p>
        </div>
        {status === 'sent' ? (
          <p className="text-center text-neutral-300">Magic link sent to <strong>{email}</strong>. Check your inbox.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: PWA root — auth gate**

Create `src/app/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';

export const dynamic = 'force-dynamic';

export default async function AppHomePage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');
  const profile = await getById(session.user.id);
  if (!profile || !profile.displayName) redirect('/app/profile');
  redirect('/app/record');
}
```

- [ ] **Step 4: Commit**

```bash
pnpm typecheck
git add src/app/app
git commit -m "feat(pwa): shell layout + sign-in page + root auth gate"
```

---

### Task 16: PWA profile page

**Files:**
- Create: `src/app/app/profile/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/app/profile/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string };
  telegramUsername: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.profile);
      }
    })();
  }, []);

  async function saveBasics(form: HTMLFormElement) {
    setSaving(true);
    const fd = new FormData(form);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: fd.get('displayName'),
        tagline: fd.get('tagline') || null,
        selfIntro: fd.get('selfIntro') || null,
      }),
    });
    setSaving(false);
    if (res.ok) router.push('/app/record');
  }

  async function uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append('photo', file);
    await fetch('/api/profile', { method: 'PUT', body: fd });
  }

  async function setSocial(kind: string, value: string) {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ social: kind, value }),
    });
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Set up your card</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); saveBasics(e.currentTarget); }}
        className="space-y-3"
      >
        <input
          name="displayName"
          placeholder="Display name (Tim Nan)"
          required
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          defaultValue={profile?.displayName ?? ''}
        />
        <input
          name="tagline"
          placeholder="One-liner (PM building crypto products)"
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          defaultValue={profile?.tagline ?? ''}
        />
        <textarea
          name="selfIntro"
          placeholder="Optional — extra context the AI uses for extraction"
          rows={2}
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
          className="block text-sm"
        />
        <div className="space-y-2">
          <label className="text-sm text-neutral-400">Socials (optional)</label>
          {(['x', 'linkedin', 'email', 'website'] as const).map((kind) => (
            <input
              key={kind}
              placeholder={kind}
              className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
              onBlur={(e) => e.target.value && setSocial(kind, e.target.value)}
              defaultValue={profile?.socials?.[kind] ?? ''}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Done — start recording'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add a GET handler to `/api/profile` so the form can seed**

Append to `src/app/api/profile/route.ts` (and add `import { getById } from '@/services/UserProfileService';` if not already present):

```ts
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await getById(session.user.id);
  return NextResponse.json({ profile });
}
```

(The page's `useEffect` from Step 1 already calls `GET /api/profile` — once this handler exists, the form auto-populates on load.)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/app/profile src/app/api/profile
git commit -m "feat(pwa): profile page — name/tagline/photo/socials"
```

---

### Task 17: PWA record page — MediaRecorder + waveform + upload

**Files:**
- Create: `src/app/app/record/page.tsx`

- [ ] **Step 1: Implement the record page**

Create `src/app/app/record/page.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type State = 'idle' | 'recording' | 'uploading';

export default function RecordPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start();
    recorderRef.current = rec;
    setState('recording');
    setElapsed(0);

    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      const next = Array.from({ length: 20 }, (_, i) => {
        const idx = Math.floor((i / 20) * data.length);
        return data[idx] / 255;
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState('uploading');

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', new File([blob], `memo.${(rec.mimeType || 'webm').split('/')[1].split(';')[0]}`, { type: blob.type }));
    const res = await fetch('/api/capture', { method: 'POST', body: fd });
    if (!res.ok) {
      alert(`Upload failed: ${await res.text()}`);
      setState('idle');
      return;
    }
    const { interactionId } = await res.json();
    router.push(`/app/cards/${interactionId}`);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{state === 'recording' ? 'Recording…' : 'Tap to start'}</h1>
          <p className="text-neutral-400 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
        </div>
        <div className="flex items-end justify-center gap-1 h-20">
          {levels.map((v, i) => (
            <div key={i} style={{ height: `${Math.max(8, v * 80)}px` }} className="w-1 bg-white/70 rounded" />
          ))}
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => (state === 'idle' ? start() : state === 'recording' ? stop() : undefined)}
            disabled={state === 'uploading'}
            className={`w-24 h-24 rounded-full flex items-center justify-center font-semibold transition ${
              state === 'recording' ? 'bg-red-500 text-white' : 'bg-white text-neutral-950'
            } disabled:opacity-50`}
          >
            {state === 'idle' ? '●' : state === 'recording' ? '■' : '…'}
          </button>
        </div>
        {state === 'uploading' && <p className="text-center text-neutral-400 text-sm">Cooking your card…</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/app/record
git commit -m "feat(pwa): record page — MediaRecorder + waveform + upload"
```

---

### Task 18: PWA post-capture card page (poll + share + fix-handle)

**Files:**
- Create: `src/app/app/cards/[id]/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/app/cards/[id]/page.tsx`:

```tsx
'use client';

import { use, useEffect, useState } from 'react';

type CardData = {
  status: 'processing' | 'ready' | 'failed';
  interaction?: { id: string; recap: string };
  contact?: { id: string; name: string; telegram: string | null };
  cardUrl?: string;
  caption?: string;
  shareUrl?: string;
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CardData>({ status: 'processing' });
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async function poll() {
      while (!cancelled) {
        const res = await fetch(`/api/cards/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const j = (await res.json()) as CardData;
        if (cancelled) return;
        setData(j);
        if (j.status !== 'processing') return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function share() {
    if (!data.cardUrl || !data.caption || !data.shareUrl) return;
    try {
      const res = await fetch(data.cardUrl);
      const blob = await res.blob();
      const file = new File([blob], 'card.png', { type: 'image/png' });
      const payload: ShareData = { title: `Card for ${data.contact?.name ?? ''}`, text: data.caption, url: data.shareUrl };
      if (navigator.canShare?.({ files: [file] })) payload.files = [file];
      await navigator.share(payload);
    } catch (err) {
      // user cancelled or unsupported — fall through
    }
  }

  async function saveHandle() {
    if (!data.contact) return;
    const res = await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram: newHandle.replace(/^@/, '') }),
    });
    if (res.ok) {
      const refreshed = await fetch(`/api/cards/${id}`, { cache: 'no-store' });
      setData(await refreshed.json());
      setEditingHandle(false);
      setNewHandle('');
    }
  }

  if (data.status === 'processing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-neutral-400">Cooking your card…</p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-red-400 mb-4">Something went wrong with this capture.</p>
        <a href="/app/record" className="px-4 py-2 rounded-lg bg-white text-neutral-950 font-semibold">Try again</a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      {data.cardUrl && <img src={data.cardUrl} alt="card" className="w-full rounded-2xl" />}
      <div className="space-y-1">
        <p className="text-lg font-semibold">For {data.contact?.name}</p>
        <p className="italic text-neutral-300">"{data.interaction?.recap}"</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        {data.contact?.telegram ? (
          <span>@{data.contact.telegram}</span>
        ) : (
          <span>No Telegram handle captured</span>
        )}
        <button onClick={() => setEditingHandle(true)} className="underline">✏️ Fix</button>
      </div>
      {editingHandle && (
        <div className="space-y-2">
          <input
            placeholder="@handle"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          />
          <button onClick={saveHandle} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">Save</button>
        </div>
      )}
      <button onClick={share} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">📤 Share</button>
      <button
        onClick={() => navigator.clipboard.writeText(data.caption ?? '')}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
      >
        📋 Copy caption
      </button>
      <a href={data.cardUrl} download className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white">💾 Save image</a>
    </div>
  );
}
```

- [ ] **Step 2: Add the contact-edit route**

Create `src/app/api/contacts/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { setContactLink, getInteractionWithContact } from '@/services/ContactService';
import { db } from '@/lib/db/client';
import { contacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  telegram: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/).optional(),
  name: z.string().min(1).max(80).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const rows = await db().select({ userId: contacts.userId }).from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!rows[0] || rows[0].userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad input' }, { status: 400 });

  if (parsed.data.telegram !== undefined) await setContactLink(id, 'telegram', parsed.data.telegram);
  if (parsed.data.name !== undefined) {
    await db().update(contacts).set({ name: parsed.data.name }).where(eq(contacts.id, id));
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/app/cards src/app/api/contacts
git commit -m "feat(pwa): post-capture page with poll + share + edit handle"
```

---

### Task 19: PWA recent cards list

**Files:**
- Create: `src/app/app/cards/page.tsx`
- Create: `src/app/api/cards/route.ts`

- [ ] **Step 1: List endpoint**

Create `src/app/api/cards/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db()
    .select({
      interactionId: interactions.id,
      contactName: contacts.name,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .innerJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(eq(contacts.userId, session.user.id))
    .orderBy(desc(interactions.occurredAt))
    .limit(50);

  const base = env().R2_PUBLIC_URL_BASE;
  return NextResponse.json({
    cards: rows.map((r) => ({
      interactionId: r.interactionId,
      contactName: r.contactName,
      occurredAt: r.occurredAt,
      cardUrl: `${base}/cards/${r.interactionId}.png`,
    })),
  });
}
```

- [ ] **Step 2: List page**

Create `src/app/app/cards/page.tsx`:

```tsx
import Link from 'next/link';
import { getServerSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');

  const rows = await db()
    .select({
      interactionId: interactions.id,
      contactName: contacts.name,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .innerJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(eq(contacts.userId, session.user.id))
    .orderBy(desc(interactions.occurredAt))
    .limit(50);

  const base = env().R2_PUBLIC_URL_BASE;

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your cards</h1>
        <Link href="/app/record" className="px-3 py-2 rounded-lg bg-white text-neutral-950 text-sm font-semibold">+ Record</Link>
      </div>
      <ul className="space-y-3">
        {rows.length === 0 && <p className="text-neutral-400">No cards yet. Record your first memo.</p>}
        {rows.map((r) => (
          <li key={r.interactionId}>
            <Link href={`/app/cards/${r.interactionId}`} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-lg">
              <img src={`${base}/cards/${r.interactionId}.png`} alt={r.contactName} className="w-12 h-20 object-cover rounded" />
              <div className="flex-1">
                <p className="font-semibold">{r.contactName}</p>
                <p className="text-xs text-neutral-400">{new Date(r.occurredAt).toLocaleDateString()}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
pnpm typecheck
git add src/app/app/cards src/app/api/cards
git commit -m "feat(pwa): recent cards list page"
```

---

### Task 20: vCard generator + `/c/[id]` public card page + `/c/[id]/vcard` route

**Files:**
- Create: `src/lib/vcard.ts`
- Create: `src/lib/vcard.test.ts`
- Create: `src/app/c/[id]/page.tsx`
- Create: `src/app/c/[id]/vcard/route.ts`

- [ ] **Step 1: vCard TDD**

Create `src/lib/vcard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildVCard } from './vcard';

describe('buildVCard', () => {
  it('emits a valid vCard 3.0 string', () => {
    const v = buildVCard({
      displayName: 'Tim Nan',
      tagline: 'PM building crypto products',
      socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com', website: 'tim.dev' },
      telegramUsername: 'timnan',
    });
    expect(v).toContain('BEGIN:VCARD');
    expect(v).toContain('VERSION:3.0');
    expect(v).toContain('FN:Tim Nan');
    expect(v).toContain('TITLE:PM building crypto products');
    expect(v).toContain('EMAIL;TYPE=INTERNET:tim@example.com');
    expect(v).toContain('URL;TYPE=Website:https://tim.dev');
    expect(v).toContain('URL;TYPE=Twitter:https://x.com/timnan');
    expect(v).toContain('URL;TYPE=LinkedIn:https://linkedin.com/in/timnan');
    expect(v).toContain('URL;TYPE=Telegram:https://t.me/timnan');
    expect(v).toContain('END:VCARD');
  });

  it('omits unset socials', () => {
    const v = buildVCard({
      displayName: 'Tim Nan',
      tagline: null,
      socials: {},
      telegramUsername: null,
    });
    expect(v).not.toContain('EMAIL');
    expect(v).not.toContain('URL');
    expect(v).not.toContain('TITLE');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm exec vitest run src/lib/vcard.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/lib/vcard.ts`:

```ts
import type { Socials } from './db/schema';

const CRLF = '\r\n';

function ensureUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function buildVCard(input: {
  displayName: string;
  tagline: string | null;
  socials: Socials;
  telegramUsername: string | null;
}): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`, `N:${input.displayName};;;;`];
  if (input.tagline) lines.push(`TITLE:${input.tagline}`);
  if (input.socials.email) lines.push(`EMAIL;TYPE=INTERNET:${input.socials.email}`);
  if (input.socials.website) lines.push(`URL;TYPE=Website:${ensureUrl(input.socials.website)}`);
  if (input.socials.x) lines.push(`URL;TYPE=Twitter:https://x.com/${input.socials.x}`);
  if (input.socials.linkedin) {
    const handle = input.socials.linkedin.replace(/^in\//, '');
    lines.push(`URL;TYPE=LinkedIn:https://linkedin.com/in/${handle}`);
  }
  if (input.telegramUsername) lines.push(`URL;TYPE=Telegram:https://t.me/${input.telegramUsername}`);
  lines.push('END:VCARD');
  return lines.join(CRLF);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run src/lib/vcard.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Public landing page**

Create `src/app/c/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return { title: 'Connectyall' };
  return {
    title: `Card from ${(await getById(found.contact.userId))?.displayName ?? 'Connectyall'}`,
    description: (found.interaction.structuredData as { recap?: string } | null)?.recap ?? '',
  };
}

export default async function PublicCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) notFound();
  const { interaction, contact } = found;
  const profile = await getById(contact.userId);
  if (!profile) notFound();

  const recap = (interaction.structuredData as { recap?: string } | null)?.recap ?? '';
  const cardUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`;

  const links: Array<{ label: string; href: string }> = [];
  if (profile.telegramUsername) links.push({ label: '📱 Telegram', href: `https://t.me/${profile.telegramUsername}` });
  if (profile.socials.x) links.push({ label: '🐦 X', href: `https://x.com/${profile.socials.x}` });
  if (profile.socials.linkedin) {
    const handle = profile.socials.linkedin.replace(/^in\//, '');
    links.push({ label: '💼 LinkedIn', href: `https://linkedin.com/in/${handle}` });
  }
  if (profile.socials.email) links.push({ label: '📧 Email', href: `mailto:${profile.socials.email}` });
  if (profile.socials.website) {
    const url = /^https?:\/\//i.test(profile.socials.website) ? profile.socials.website : `https://${profile.socials.website}`;
    links.push({ label: '🌐 Website', href: url });
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <img src={cardUrl} alt={`Card for ${contact.name}`} className="w-full rounded-2xl" />
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-400">For {contact.name}</p>
          <h1 className="text-3xl font-bold">{profile.displayName}</h1>
          {profile.tagline && <p className="text-neutral-300">{profile.tagline}</p>}
        </div>
        {recap && (
          <p className="italic text-neutral-300 text-center">"{recap}"</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-center text-sm">
              {l.label}
            </a>
          ))}
        </div>
        <a
          href={`/c/${interaction.id}/vcard`}
          className="block w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold text-center"
        >
          💾 Save {profile.displayName.split(' ')[0]} to Contacts
        </a>
        <p className="text-center text-xs text-neutral-500"><a href="/" className="underline">made with Connectyall</a></p>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: vCard download route**

Create `src/app/c/[id]/vcard/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getInteractionWithContact } from '@/services/ContactService';
import { getById } from '@/services/UserProfileService';
import { buildVCard } from '@/lib/vcard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) return new NextResponse('Not found', { status: 404 });
  const profile = await getById(found.contact.userId);
  if (!profile) return new NextResponse('Not found', { status: 404 });

  const vcf = buildVCard({
    displayName: profile.displayName,
    tagline: profile.tagline,
    socials: profile.socials,
    telegramUsername: profile.telegramUsername,
  });

  return new NextResponse(vcf, {
    status: 200,
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${profile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}.vcf"`,
    },
  });
}
```

- [ ] **Step 7: Commit**

```bash
pnpm typecheck
git add src/lib/vcard.ts src/lib/vcard.test.ts src/app/c
git commit -m "feat: public card landing + vCard download"
```

---

### Task 21: Connect Telegram bot handler + PWA "Connect Telegram" button

**Files:**
- Create: `src/lib/telegram/connect.ts`
- Modify: `src/app/api/telegram/route.ts`
- Modify: `src/app/app/profile/page.tsx`
- Create: `src/app/api/telegram-link/route.ts`

The flow: user clicks "Connect Telegram" in PWA → server issues a one-time token → returns `https://t.me/<botname>?start=link_<token>` deep link → user opens it in Telegram → bot `/start link_<token>` consumes the token, sets `users.telegramUserId`, replies "Linked."

- [ ] **Step 1: Bot side — connect handler**

Create `src/lib/telegram/connect.ts`:

```ts
import { bot } from './bot';
import { consumeLinkToken } from '@/services/TelegramLinkService';

bot().on('text', async (ctx, next) => {
  // /start link_<token> arrives as just text after the start payload is consumed via bot.start.
  return next();
});

bot().start(async (ctx, next) => {
  const payload = (ctx.message?.text ?? '').replace(/^\/start\s*/, '').trim();
  if (payload.startsWith('link_')) {
    const token = payload.slice('link_'.length);
    const ok = await consumeLinkToken(token, ctx.from!.id, ctx.from!.username ?? null);
    if (ok) {
      await ctx.reply('✅ Linked. Your bot account and web account share the same CRM now.');
    } else {
      await ctx.reply('That link expired or is invalid. Try generating a new one in the web app.');
    }
    return;
  }
  return next();
});
```

Wait — Telegraf's `bot.start()` is the canonical `/start` handler. We need to register OURS before the onboarding's `/start` runs. Easiest fix: in onboarding.ts the `/start` handler ignores updates that start with `link_`. Update `src/lib/telegram/onboarding.ts`'s start handler to check the payload:

```ts
bot().start(async (ctx, next) => {
  const payload = (ctx.message?.text ?? '').replace(/^\/start\s*/, '').trim();
  if (payload.startsWith('link_')) return next(); // let connect.ts handle this
  // ... existing onboarding code
});
```

And ensure `import '@/lib/telegram/connect'` happens AFTER `import '@/lib/telegram/onboarding'` in the route handler.

- [ ] **Step 2: Register**

In `src/app/api/telegram/route.ts`, add the import:

```ts
import '@/lib/telegram/onboarding';
import '@/lib/telegram/capture';
import '@/lib/telegram/inline';
import '@/lib/telegram/fix';
import '@/lib/telegram/connect';   // NEW
```

- [ ] **Step 3: API route for issuing the link**

Create `src/app/api/telegram-link/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { issueLinkToken } from '@/services/TelegramLinkService';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const token = await issueLinkToken(session.user.id);
  return NextResponse.json({
    url: `https://t.me/${env().TELEGRAM_BOT_USERNAME}?start=link_${token}`,
  });
}
```

- [ ] **Step 4: Add the button to the profile page**

Append to `src/app/app/profile/page.tsx`, near the bottom of the form:

```tsx
<div className="pt-4 border-t border-neutral-800">
  <button
    type="button"
    onClick={async () => {
      const res = await fetch('/api/telegram-link', { method: 'POST' });
      const { url } = await res.json();
      window.location.href = url;
    }}
    className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
  >
    🔗 Connect Telegram (optional)
  </button>
</div>
```

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add src/lib/telegram/connect.ts src/lib/telegram/onboarding.ts src/app/api/telegram/route.ts src/app/api/telegram-link src/app/app/profile
git commit -m "feat: Connect Telegram from web — token-based deep link"
```

---

### Task 22: Deploy + smoke test

**Pre-requisite manual work:**

- [ ] Create a Resend account at https://resend.com → get `RESEND_API_KEY`. Verify a domain or use Resend's testing sender (`onboarding@resend.dev` works for dev).
- [ ] Generate a 32-byte random secret for `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).

**Plan steps:**

- [ ] **Step 1: Add the new env vars to Vercel**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
printf "%s" "<RESEND_API_KEY>" | vercel env add RESEND_API_KEY production
printf "%s" "Connectyall <onboarding@resend.dev>" | vercel env add RESEND_FROM_EMAIL production
printf "%s" "<32-byte-secret>" | vercel env add BETTER_AUTH_SECRET production
printf "%s" "https://connectyall.vercel.app" | vercel env add BETTER_AUTH_URL production
```

Replace `<>` with real values.

- [ ] **Step 2: Run the migration against production**

```bash
pnpm db:migrate
```

Expected: applies `0001_users_uuid_pk.sql` and `0002_*.sql` successfully.

- [ ] **Step 3: Build locally to validate**

```bash
pnpm build
```

Expected: success.

- [ ] **Step 4: Deploy + re-sync Inngest**

```bash
vercel --prod
curl -X PUT https://connectyall.vercel.app/api/inngest
```

- [ ] **Step 5: Smoke test on mobile**

On your phone, open `https://connectyall.vercel.app/app` (or a fresh incognito session):

1. Enter email → tap "Send magic link"
2. Open the email on the same device → tap link → you should land on `/app` and be redirected to `/app/profile`
3. Enter display name + tagline + upload photo + set socials → tap "Done"
4. You should land on `/app/record`
5. Tap mic → speak "Met Jane at the meetup, her email is jane@example.com, we talked about pricing" → tap stop
6. Wait ~15s on the polling screen
7. Card appears with the captured contact name + recap + Share button
8. Tap **📤 Share** → native iOS/Android share sheet opens → send to yourself via iMessage
9. Open the iMessage thread → tap the URL in the message → land on `/c/<id>` public card page
10. Tap **💾 Save Tim to Contacts** → iOS/Android downloads `.vcf` → Contacts app prompts to add → confirm
11. Check Contacts on your phone — Tim should be there with email/website/etc populated

- [ ] **Step 6: Smoke test the bot still works**

Open `@connectyallbot` in Telegram → record a voice memo → confirm the card appears with all 3 buttons as before.

- [ ] **Step 7: Optional — link bot to web account**

In the PWA profile page, tap "🔗 Connect Telegram (optional)" → opens Telegram → tap Start → bot confirms "✅ Linked." Refresh `/app/cards` and any bot-captured cards should appear there too.

- [ ] **Step 8: Final commit + push**

```bash
git push origin feature/pwa-capture
```

Open a PR from `feature/pwa-capture` → `main` on GitHub for the merge.

---

## Spec Coverage Self-Review

| Spec section | Task |
|---|---|
| Architecture: /app shell + /c/<id> + /api routes | Tasks 12-15, 17-20 |
| Identity model: users.id uuid + email + nullable telegramUserId | Task 2 |
| Schema migration data steps | Task 2 |
| Better Auth's sessions/accounts/verifications | Task 3 |
| Auth: magic-link via Resend | Tasks 4, 5 |
| Connect Telegram from PWA | Task 21 |
| Existing bot user merge prompt | Task 21 (covered by Connect Telegram flow) |
| Hot path /app/record → upload → poll → share | Tasks 12, 13, 17, 18 |
| Card pre-mint stub + status enum | Tasks 2, 8 |
| processCapture generalization (web + bot inputs) | Task 11 |
| Web Share API + caption + URL + image | Task 18 |
| /c/[id] public landing | Task 20 |
| vCard 3.0 download | Task 20 |
| Edit name/handle on post-capture screen | Task 18 |
| Recent cards list (/app/cards) | Task 19 |

**Things explicitly NOT in v1 of PWA (per spec): service worker, social login, push notifications, multi-language — none of these have tasks, as intended.**

---

## Notes for the executing agent

1. **The bot must keep working at every commit.** After Task 2 (schema migration) every following task should be verified with `pnpm typecheck` and the existing CaptureService tests. If a refactor breaks bot capture, fix forward.
2. **Migrations are destructive in the production sense.** Run `db:migrate` only after you've confirmed the local `pnpm typecheck` and unit tests pass.
3. **`pnpm test` must stay green** through the entire plan. Fix the test mocks when service signatures change (Tasks 6, 7, 11).
4. **Don't add features the plan doesn't ask for.** No PWA manifest, no service worker, no social login in this branch — punt to a v2 plan after the core flow is shipping.
5. **`process.env.SKIP_ENV_VALIDATION=true` is already wired in `next.config.ts`** so `pnpm build` works without real env. Production gets real values via Vercel env vars.
