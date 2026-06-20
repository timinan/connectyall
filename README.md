# Connectyall

A phone-first PWA that turns the voice memo you record right after meeting someone into a shareable connection card.

**Live:** https://connectyall.vercel.app

## What it does

You meet someone. Walking away, you tap a button and just talk: "Met Sarah at the AI breakfast. She's hiring backend engineers. Telegram is @sarahc, email sarah@acme.com. Send her the deck I told her about." A few seconds later you have a real contact, a recap of what you talked about, and a single share link that gives Sarah a clean page with your photo, your details, and an option to save you to her phone.

No typing on the napkin. No "I'll send you my LinkedIn later" that never happens.

## Stack

- **Frontend + API:** TypeScript, Next.js 16 (App Router) on Vercel
- **Auth:** Better Auth with email OTP (no passwords, no magic links)
- **DB:** Neon Postgres with Drizzle ORM
- **Audio:** Browser MediaRecorder → Cloudflare R2 (private bucket)
- **Transcription:** Cloudflare Workers AI Whisper
- **Extraction:** Vercel AI SDK + Gemini 2.5 Flash Lite (env-configurable; Anthropic Haiku also wired up)
- **Background jobs:** Inngest cron janitor (recovers stuck recordings)
- **Image rendering:** Satori + Resvg for 512×512 round profile photos
- **Email:** Resend
- **Hosting:** Vercel

## How a capture flows

1. Phone uploads audio to R2 and mints an `interactions` row stamped with the user's id and the R2 key
2. The same `/api/capture` request runs the pipeline inline via Next 16's `after()`: transcribe → extract contacts → write to DB → render card PNG → mark ready
3. Phone polls `/api/cards/[id]` every 500ms (then backs off to 1500ms after 5s) until the row is ready
4. Typical end-to-end: 3–6 seconds from tap-Stop to seeing the contact card

If anything drops mid-pipeline (network blip, function timeout, deploy interruption), an Inngest cron janitor sweeps every 2 minutes, finds rows still at `status='processing'` with their capture metadata intact, and re-runs the pipeline against the same audio in R2.

## Dev

```bash
pnpm install
cp .env.example .env.local       # fill in real values, or `vercel env pull .env.local`
pnpm db:migrate                  # apply Drizzle migrations to your Neon DB
pnpm dev
```

```bash
pnpm test                        # vitest
pnpm typecheck                   # tsc --noEmit
pnpm db:studio                   # Drizzle Studio
```

## Design system

`docs/design-system.html` — single self-contained HTML file documenting colors, type (Sora + JetBrains Mono), components, screens, animations, copy voice, anti-patterns. Open it before building any new UI. Update it when the system changes so it doesn't drift from the code.

## Specs and plans

Branching work is captured under `docs/superpowers/`:

- `specs/` — design docs by date (`YYYY-MM-DD-<feature>-design.md`)
- `plans/` — implementation plans matching each spec

Both directories are append-only history of what was built and why.

## License

MIT. Built by [Tim Nan](https://timnan.com) as part of an open portfolio.
