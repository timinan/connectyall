'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LuMic, LuUser, LuUsers } from 'react-icons/lu';

const TABS = [
  { href: '/app/profile', icon: LuUser, label: 'Profile', match: '/app/profile' },
  { href: '/app/record', icon: LuMic, label: 'Record', match: '/app/record' },
  { href: '/app/connections', icon: LuUsers, label: 'Network', match: '/app/connections' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Tracks which tab the user just tapped — visible "pressed" state until the new route commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state once the pathname actually changes to the new route.
  useEffect(() => {
    if (pendingHref && pathname.startsWith(pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname.startsWith(href)) return;
    setPendingHref(href);

    // Use the View Transitions API when available — animates the page swap.
    // Falls back to Next.js's normal client navigation otherwise.
    const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;
    if (supportsVT) {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).startViewTransition(() => router.push(href));
    }
    // If unsupported, let the Link handle navigation normally (no preventDefault).
  }

  return (
    <nav
      className="bnav-pin fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F0F12] text-white rounded-full p-1.5 flex gap-1 items-center shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
    >
      {TABS.map(({ href, icon: Icon, label, match }) => {
        const active = pathname.startsWith(match);
        const isPending = pendingHref === href;
        const showLabel = active || isPending;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={(e) => handleClick(e, href)}
            aria-label={label}
            className={
              showLabel
                ? `inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-brand text-white text-sm font-semibold transition-transform active:scale-95 ${isPending ? 'opacity-80' : ''}`
                : `w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90 active:bg-white/10 ${isPending ? 'opacity-70' : ''}`
            }
          >
            <Icon size={16} />
            {showLabel && <span>{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
