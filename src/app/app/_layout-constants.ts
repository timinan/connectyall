// Shared container classes for every logged-in page.
// If you tweak the width, padding, or footer-clearance, change it HERE so all
// pages (record, profile, post-capture, card list, loading states) stay in sync.
//
// Mobile (<640px): px-4 / py-6 — tight horizontal padding so cards fill the screen.
// sm+ : px-6 padding and max-w-xl (576px) centered with mx-auto.
// pb-20 leaves room for the fixed footer at the bottom of the viewport.

export const APP_CONTAINER = 'px-4 py-6 pb-20 sm:px-6 sm:max-w-xl sm:mx-auto space-y-4 w-full';
