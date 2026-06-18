# Instant Recording — Design

## Goal

Get a returning user from "phone in hand" to "ready to record" in one tap, while keeping new visitors landing on the marketing page they can read first.

## Why

Today a returning user goes: type URL → marketing root → "Open the app" → `/app` → redirect → record. Two clicks for someone who already knows the product. The whole point of Connectyall is "talk it out in the moment" — every extra screen between meeting someone and recording the memo is friction that defeats the product.

The fastest possible flow we can build with a webapp is:
1. App icon on the home screen
2. Tap → record screen

That requires three things that compound: long-lived session, root-page server-side redirect for signed-in users, and a PWA manifest so users can add the app to their home screen.

## Scope

- **Sessions persist for 365 days.** Tim's beta call — zero re-auth friction. Sign-out remains explicit.
- **`/` (root) redirects signed-in onboarded users to `/app/record`.** New / logged-out visitors still see the marketing hero with the "Open the app" CTA.
- **PWA install support.** `manifest.webmanifest`, PNG icons at 192/512/180, Apple-specific meta tags, theme color. After install the home-screen icon opens the app in standalone mode with the existing session.
- **Explicit sign-out.** A small "Sign out" button on the profile page. Clears the session and redirects to `/`.

Out of scope:
- Custom "Add to home screen" install prompt UI — rely on the browser default for v1.
- Service worker / offline mode. Manifest alone is enough for installability and home-screen icon.
- WebAuthn / passkey / biometric re-auth. Long session is fine for beta.
- "Sign out of all devices" — only the current session for v1.

## Design

### Session length

In `src/lib/auth/server.ts`, extend the Better Auth config with an explicit `session` block:

```ts
session: {
  expiresIn: 60 * 60 * 24 * 365, // 365 days
  updateAge: 60 * 60 * 24,        // refresh the cookie's expiry every 24 h of activity
},
```

The 1-day `updateAge` is a sliding window — every time the user visits, the cookie's expiry resets to 365 days from that moment. So an active user effectively never has to re-sign-in.

Cookie attributes (already correct in Better Auth defaults): `HttpOnly`, `Secure`, `SameSite=Lax`.

### Root redirect

Convert `src/app/page.tsx` from a static React component to an async server component. At the top:

```ts
const session = await getServerSession();
if (session) {
  const profile = await getById(session.user.id);
  if (profile?.onboardedAt) redirect('/app/record');
}
```

If signed in + onboarded → straight to record.
If signed in but not yet onboarded → don't redirect (marketing is fine; the user will hit `/app` again via the CTA and get pushed to `/app/profile` by the existing redirect logic).
If not signed in → render marketing as today.

This keeps the marketing experience for new visitors and gives returning users a one-tap landing.

### PWA install

Three pieces:

**1. `public/manifest.webmanifest`:**

```json
{
  "name": "Connectyall",
  "short_name": "Connectyall",
  "description": "Voice notes that connect y'all.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#7C5CFF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**2. PNG icons.** Generated once from the existing `public/icon.svg` using `@resvg/resvg-js` (already a dep, used by CardService). Commit the generated PNGs.

| File | Size | Used by |
|---|---|---|
| `public/icon-192.png` | 192×192 | Android home screen, manifest |
| `public/icon-512.png` | 512×512 | Android splash screen, manifest |
| `public/apple-touch-icon.png` | 180×180 | iOS home screen |

**3. Wire up in `src/app/layout.tsx`.** Extend the existing `metadata` export so Next.js emits the right tags:

```ts
export const metadata: Metadata = {
  // ...existing...
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Connectyall',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  // ...existing...
  themeColor: '#7C5CFF',
};
```

That generates `<link rel="manifest">`, `<meta name="apple-mobile-web-app-capable">`, `<meta name="apple-mobile-web-app-title">`, `<meta name="theme-color">`. Apple-touch-icon will be picked up from `public/apple-touch-icon.png` automatically (Next.js convention).

### Sign-out button

On `src/app/app/profile/page.tsx`, add a subtle "Sign out" link below the existing form. Not a primary CTA — just a plain text button. Tapping it:

1. Calls Better Auth's `signOut()` client method (clears the session cookie).
2. `router.push('/')` — back to marketing root.

Placement: below the "Save and start connecting" button, with a bit of vertical spacing. Style: `text-neutral-500 text-sm` so it's discoverable but not competing.

## Files affected

**Create**
- `public/manifest.webmanifest`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/apple-touch-icon.png`
- `scripts/generate-pwa-icons.ts` — one-time script that uses resvg to convert `icon.svg` to the three PNGs. Doesn't need to run on build; we commit the outputs.

**Modify**
- `src/lib/auth/server.ts` — add `session` block
- `src/app/page.tsx` — server component with session check + redirect
- `src/app/layout.tsx` — manifest, appleWebApp, themeColor
- `src/app/app/profile/page.tsx` — sign-out button

No DB migration. No API surface change.

## Testing

Browser smoke (preview):
- **Cold tap when signed in:** Visit `/` while signed in → instant redirect to `/app/record`. URL bar should briefly show `/` then settle on `/app/record`.
- **Cold tap when signed out:** Visit `/` in a private window → marketing renders as before, no redirect.
- **PWA install on iPhone:** Open preview in Safari → Share menu → Add to Home Screen → icon appears with purple-C logo and "Connectyall" label → tap icon → opens in standalone (no Safari chrome) → lands directly on `/app/record` (because session persists across launches).
- **PWA install on Android Chrome:** Browser should prompt "Install Connectyall" or surface it in the kebab menu after a session of use. Same standalone behaviour.
- **Sign out:** Profile page → tap "Sign out" → land on `/` → marketing renders, "Open the app" leads to sign-in, magic link required again.
- **Session persistence:** Sign in → close the tab → reopen later that day → still signed in.

## Risks

- **Existing sessions don't extend automatically.** Anyone signed in before this lands will have whatever expiry their session was given on creation (7 days from when they signed in). Only new sign-ins after the change benefit from the 365-day window. Acceptable — these users will re-sign-in once within 7 days and then never again.
- **iOS PWA install only works in Safari, not embedded webviews.** Sharing the preview URL inside iMessage and opening it there won't show "Add to Home Screen." That's an iOS limitation, not ours. Users need to be in Safari to install.
- **Standalone-mode auth deep-link.** If a user clicks a magic link from their email app while the PWA is installed, iOS may open the link in Safari instead of the PWA. Sessions still sync across both because the cookie is on the same origin, but the *first* sign-in might feel slightly off. Documenting this as a known quirk; not blocking beta.
- **`/` redirect adds a server-side DB lookup on every public visit.** Cheap (single index lookup by user id) but we should measure if root traffic ever spikes. For beta, fine.
