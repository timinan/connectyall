'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LuMic, LuUser, LuUsers } from 'react-icons/lu';

const TABS = [
  { href: '/app/profile', icon: LuUser, label: 'Profile', match: '/app/profile' },
  { href: '/app/record', icon: LuMic, label: 'Record', match: '/app/record' },
  { href: '/app/connections', icon: LuUsers, label: 'Connections', match: '/app/connections' },
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
    const currentIndex = TABS.findIndex(t => pathname.startsWith(t.match));
    const nextIndex = TABS.findIndex(t => t.href === href);
    const direction: 'left' | 'right' = nextIndex > currentIndex ? 'right' : 'left';
    setPendingHref(href);

    // Use the View Transitions API when available — animates the page swap.
    // The direction class drives a directional slide via CSS in globals.css.
    const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;
    if (supportsVT) {
      e.preventDefault();
      const root = document.documentElement;
      root.classList.add(`vt-slide-${direction}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transition = (document as any).startViewTransition(() => router.push(href));
      transition.finished.finally(() => {
        root.classList.remove(`vt-slide-left`);
        root.classList.remove(`vt-slide-right`);
      });
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
        const expanded = active || isPending;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={(e) => handleClick(e, href)}
            aria-label={label}
            className={`
              inline-flex items-center h-10 rounded-full overflow-hidden
              transition-all duration-300 ease-out will-change-[width]
              active:scale-95
              ${expanded
                ? 'bg-brand text-white'
                : 'text-zinc-400 hover:text-white'}
            `}
            style={{ width: expanded ? '148px' : '40px' }}
          >
            <span className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <Icon size={16} />
            </span>
            <span
              className={`
                text-sm font-semibold whitespace-nowrap pr-4 -ml-1
                transition-opacity duration-200
                ${expanded ? 'opacity-100 delay-100' : 'opacity-0 pointer-events-none'}
              `}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
