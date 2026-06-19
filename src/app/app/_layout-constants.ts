// Shared container classes for every logged-in page.
//
// Mobile (<640px): px-4 / py-6 — tight horizontal padding so cards fill the screen.
// sm+: px-6 padding and max-w-xl (576px) centered with mx-auto.
// pb-28 reserves room for the floating bottom-nav pill (~84px tall including
// its bottom inset).
//
// Three flavors:
// - APP_CONTAINER: stacking pages with bottom-nav (profile, connections) — adds space-y-4 for vertical rhythm.
// - APP_CONTAINER_FLEX: vertical-flex pages with bottom-nav (record/processing) — drops space-y-4 and
//   adds min-h-[100dvh] + flex flex-col so the mic can vertically center.
// - LANDING_CONTAINER_FLEX: vertical-flex pages WITHOUT bottom-nav (marketing root /, sign-in) — same
//   horizontal padding + max-width as the app pages so the logo + status pill land at the same spot,
//   but pb-8 instead of pb-28 since there's no nav pill to clear.
//
// IMPORTANT: every page MUST use one of these. Don't hand-roll px-* or max-w-* on the outer container.
// Drift between containers is what breaks the logo + status-pill alignment between tabs/screens.

export const APP_CONTAINER = 'px-4 py-6 pb-28 sm:px-6 sm:max-w-xl sm:mx-auto space-y-4 w-full';
export const APP_CONTAINER_FLEX = 'px-4 py-6 pb-28 sm:px-6 sm:max-w-xl sm:mx-auto w-full min-h-[100dvh] flex flex-col';
export const LANDING_CONTAINER_FLEX = 'px-4 py-6 pb-8 sm:px-6 sm:max-w-xl sm:mx-auto w-full min-h-[100dvh] flex flex-col';
