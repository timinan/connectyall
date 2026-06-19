# Connectyall — Session State

Running log of in-flight work across Claude sessions. Append every iteration. Git history has the diffs; this file has the *why* and the open threads.

**Convention:** newest entries at the top under "Current work." When a thread is fully shipped, move it to "Shipped" with the final commit SHA.

---

## Current work

### UI refresh (branch `feature/ui-refresh`)

**Status:** preview deploys green, awaiting Tim's QA before merging to main.
**Spec:** `docs/superpowers/specs/2026-06-18-ui-refresh-design.md`
**Plan:** `docs/superpowers/plans/2026-06-18-ui-refresh-plan.md`

**Latest preview:** https://connectyall-4gjfn5tx2-connectyall-s-projects.vercel.app

#### What's done (chronological, from git)

| Date | SHA | Change | Why |
|---|---|---|---|
| 2026-06-18 | a12608a, bbf42fb | spec for UI refresh, then locked decisions from mockup iterations | wanted a fresh look — iris cream bg, white cards, brand purple `#7C5CFF`, floating bottom nav, mono labels |
| 2026-06-18 | 5e71da3 | plan: 7 tasks | broke spec into subagent-sized tasks |
| 2026-06-18 | 70b7f6f | foundation — iris tokens, header + bottom nav, drop old chrome | base layer for the new look |
| 2026-06-18 | 93a77be, 5d355f3, e0613af, b9b4aaa, 88800ed | rebuilt record, connections list, connection detail, profile, sign-in | page-by-page rollout against the spec |
| 2026-06-18 | b6840a1 | marketing + privacy + terms + public landing | public surfaces match the new look |
| 2026-06-18 | 3413fa3 | marketing copy + profile polish | first round of Tim feedback |
| 2026-06-18 | 5a40ab0 | force brand hex via explicit CSS rules, heavier headlines | Tailwind v4 routes hex through OKLCH and washed out the purple — `.text-brand { color: #7C5CFF }` overrides fix it |
| 2026-06-18 | e52397a | wrap titles in white card w/ brand left border, shrink avatar glow | matched mockup; 280px glow rings were overlapping the NAME input |
| 2026-06-18 | cb6287c | white-card + brand-left-border treatment on EVERY page headline | Tim flagged it was missing on multiple pages |
| 2026-06-18 | 61c9614 | server-render profile + connections | tab switches were flashing empty pages — fix is to fetch on the server, pass initial data as props |
| 2026-06-18 | 0c68c04 | profile CTA purple, sign-out + delete side-by-side, bolder channel values | Tim hated the black CTA; wanted brand purple with purple glow |
| 2026-06-18 | d91c3f8 | animate waveform during processing, spin-bounce logo, "THINKING" header | the processing screen looked dead; also two `PROCESSING` texts were duplicated |
| 2026-06-18 | cbf1632 | server-render record page | same blank-flash bug as profile/connections, fixed the same way |
| 2026-06-18 | c40b24d | connections list — drop FAB, rename headline, tighter rows, 3-color bubbles | Tim: "get rid of the add on the right... keep colors consistent to 3" |
| 2026-06-18 | ea37f06 | record banner at top, greeting label below; 4-bounce-per-spin logo; standardize headlines to text-4xl | Tim wanted consistent banner position + headline size across pages; "bounce every 90°" instead of one big flip |

#### Open threads / unverified

- [ ] Tim's QA on the latest preview (`connectyall-4gjfn5tx2-...`)
- [ ] After QA approval: merge `feature/ui-refresh` → `main`, sync Inngest
- [ ] Sign-in page label still sits ABOVE the banner — every other page has it below. Decide if we standardize.

#### Known gotchas to remember

- **Tailwind v4 + brand purple:** `bg-brand` / `text-brand` via theme tokens get routed through OKLCH and look washed out. Keep the explicit overrides in `globals.css`. Don't delete them.
- **Tab-switch flash:** any `/app/*` page that fetches user data must be a server component that passes initial state to a renamed `*-client.tsx`. The pattern: `page.tsx` (server) → `*-client.tsx` (client).
- **Logo spinner timing:** the 4-bounce-per-rotation keyframes are tuned. If you change the duration, the bounces will look off — adjust the % keyframes proportionally.

---

## Shipped

_(move completed threads here with final merge SHA)_

---

## How to keep this file alive

- Update after every meaningful change on a connectyall branch.
- Format: prepend new rows to the "What's done" table for the active thread; add open threads as checkboxes.
- When a branch merges to main: move the section under "Shipped" with the merge SHA.
- Don't duplicate git — keep this for *intent*, *gotchas*, and *open questions*. The SHA column lets future-Claude jump back to the diff.
