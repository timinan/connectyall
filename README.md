# Connectyall

Telegram bot that turns a voice memo about someone you met into a designed card you forward to them.

**Spec:** `PM-OS/outputs/prds/2026-06-12-connectyall-design.md`
**v1 plan:** `PM-OS/outputs/prds/2026-06-13-connectyall-v1-implementation-plan.md`

## Stack

- TypeScript + Next.js 16 (App Router)
- Telegraf (Telegram Bot API)
- Drizzle + Neon Postgres
- Inngest (background jobs)
- Cloudflare Workers AI (Whisper)
- Cloudflare R2 (photo storage, S3-compatible)
- Vercel AI SDK + Claude Haiku 4.5 (extraction, env-configurable)
- Satori + Resvg (card PNG rendering)
- Vercel (hosting)

## Dev

```bash
pnpm install
cp .env.example .env.local  # fill in real values
pnpm dev
```

Run tests:

```bash
pnpm test
pnpm typecheck
```

Inspect DB:

```bash
pnpm db:studio
```

## Deploy checklist (v1)

Manual pre-flight (Tim does these once):

- [ ] Create Telegram bot via @BotFather → save `TELEGRAM_BOT_TOKEN` and the bot @username (e.g. `connectyallbot`)
- [ ] Create Neon project → copy the pooled `DATABASE_URL`
- [ ] Get Anthropic API key → `ANTHROPIC_API_KEY`
- [ ] Cloudflare:
  - Account ID → `CLOUDFLARE_ACCOUNT_ID`
  - Workers AI API token (Account ▸ AI ▸ Workers AI) → `CLOUDFLARE_API_TOKEN`
  - Create R2 bucket → `R2_BUCKET_NAME`
  - R2 API tokens (S3-compatible) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - R2 public URL or custom domain → `R2_PUBLIC_URL_BASE`
- [ ] Inngest account → app → `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- [ ] Vercel CLI installed and logged in:
  ```bash
  npm i -g vercel
  vercel login
  ```
- [ ] Fill `.env.local` with all real values

Then:

```bash
# Migrate the DB
pnpm db:migrate

# Build locally to validate
pnpm build

# Link the Vercel project
vercel link  # create a new project named "connectyall"

# Push every env var to Vercel production
# (Or use: vercel env pull / vercel env add)
for v in DATABASE_URL TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME \
         LLM_PROVIDER LLM_MODEL ANTHROPIC_API_KEY \
         CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN \
         R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_PUBLIC_URL_BASE \
         INNGEST_EVENT_KEY INNGEST_SIGNING_KEY \
         MAX_CAPTURES_PER_DAY BASE_URL; do
  vercel env add "$v" production
done

# Deploy
vercel --prod

# Note the assigned URL (e.g. https://connectyall.vercel.app)
# Update BASE_URL in Vercel env to that URL, then redeploy:
vercel env rm BASE_URL production -y
vercel env add BASE_URL production  # paste https://connectyall.vercel.app
vercel --prod

# Register the Telegram webhook
BASE_URL=https://connectyall.vercel.app \
TELEGRAM_BOT_TOKEN=<real-token> \
  pnpm exec tsx scripts/register-webhook.ts
```

Expected output from the webhook registration: `{ ok: true, result: true, description: 'Webhook was set' }`.

## Smoke test

In Telegram, open `@<TELEGRAM_BOT_USERNAME>`. Tap **Start**.
- Welcome message within 2s.
- Walk the onboarding (name → photo → tagline → socials).
- Record a voice memo about someone you recently met.
- "Got it. Cooking your card..." within 1s.
- A card image with caption arrives within ~30s.
- Tap **Forward** → forward to a test account → confirm social links are tappable.

## Architecture (one-paragraph)

Next.js App Router hosts two API routes: `/api/telegram` (Telegraf webhook) and `/api/inngest` (Inngest serve handler). The webhook acks within 1s and enqueues a `capture/process` event. An Inngest function downloads the media, transcribes via Cloudflare Whisper, extracts contact data via Claude Haiku 4.5 (env-configurable LLM via `src/lib/llm.ts`), persists via Drizzle/Neon, renders a 1080×1920 PNG via Satori + Resvg, and sends a single Telegram `sendPhoto` message with the card + caption.

## Costs (MVP scale)

| Item | Free tier | Cost |
|---|---|---|
| Vercel Hobby | Yes (no commercial) | $0 |
| Neon free | 0.5GB, auto-pause | $0 |
| Inngest free | 50k events/mo | $0 |
| Cloudflare Workers AI | 10k Whisper req/day | $0 |
| Cloudflare R2 | 10GB, no egress fee | $0 |
| Claude Haiku 4.5 | — | ~$0.0035/capture |
| Domain | — | ~$10/year |

`MAX_CAPTURES_PER_DAY=50` env var caps runaway risk.

## Repo

```
src/
├── app/
│   ├── api/
│   │   ├── inngest/route.ts    # Inngest serve handler
│   │   └── telegram/route.ts   # Telegraf webhook
│   ├── layout.tsx
│   └── page.tsx                 # Landing
├── lib/
│   ├── db/                     # Drizzle schema + client
│   ├── inngest/                # Inngest client + function
│   ├── r2/                     # R2 client
│   ├── telegram/               # Bot, onboarding, capture handlers, send helpers
│   ├── env.ts
│   └── llm.ts                  # Env-configurable LLM provider
├── services/
│   ├── CaptureService.ts       # Full pipeline orchestration + cap
│   ├── CardService.ts          # buildCaption + renderCard (Satori)
│   ├── ContactService.ts
│   ├── ExtractionService.ts    # Claude Haiku extraction
│   ├── TranscriptionService.ts # Cloudflare Whisper
│   └── UserProfileService.ts
└── test/setup.ts
```

## v2 follow-ups (flagged in code reviews)

- `setSocial` is already atomic; `addInteraction` is not (insert + update in two calls).
- `processCapture` daily-cap check has a concurrency race (two simultaneous captures both pass cap=N−1).
- No user-visible feedback when the Inngest pipeline throws (Inngest auto-retries silently). Wrap in try/catch + send "retrying..." in v2.
- `capturesInLast24h` uses a 24h rolling window, not a calendar day. May want to align.
- Onboarding-vs-capture: voice memos sent mid-onboarding skip session check. Guard in v2.
- Mock low-value schema test (`schema.test.ts`) could be replaced with a pglite integration smoke test.
