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

// Geometry — fixed so the indicator can be positioned by index without DOM measurement.
const COLLAPSED = 40;
const EXPANDED = 148;
const GAP = 4;
const PADDING = 6;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistic "the user just tapped this tab" — drives the indicator before the route commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (pendingHref && pathname.startsWith(pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  // Which tab the indicator + label should snap to right now (pending wins so the slide
  // starts the moment the user taps, before the new page has finished rendering).
  const targetHref =
    pendingHref ??
    TABS.find((t) => pathname.startsWith(t.match))?.href ??
    TABS[1].href;
  const targetIndex = Math.max(0, TABS.findIndex((t) => t.href === targetHref));

  // Indicator slides between tab positions. All collapsed tabs are COLLAPSED wide; the
  // active one expands to EXPANDED. We compute the active tab's left by summing the
  // widths of the inactive tabs before it.
  const indicatorLeft = PADDING + targetIndex * (COLLAPSED + GAP);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname.startsWith(href)) return;
    const currentIndex = TABS.findIndex((t) => pathname.startsWith(t.match));
    const nextIndex = TABS.findIndex((t) => t.href === href);
    const direction: 'left' | 'right' = nextIndex > currentIndex ? 'right' : 'left';
    setPendingHref(href);

    const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;
    if (supportsVT) {
      e.preventDefault();
      const root = document.documentElement;
      root.classList.add(`vt-slide-${direction}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transition = (document as any).startViewTransition(() => router.push(href));
      transition.finished.finally(() => {
        root.classList.remove('vt-slide-left');
        root.classList.remove('vt-slide-right');
      });
    }
  }

  return (
    <nav
      className="bnav-pin fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F0F12] rounded-full flex items-center shadow-[0_6px_20px_rgba(0,0,0,0.25)] relative"
      style={{ padding: `${PADDING}px`, gap: `${GAP}px` }}
    >
      {/* Single sliding indicator behind the active tab — animates left + width together */}
      <span
        aria-hidden
        className="absolute bg-brand rounded-full transition-[left,width] duration-300 ease-out pointer-events-none"
        style={{
          left: `${indicatorLeft}px`,
          width: `${EXPANDED}px`,
          top: `${PADDING}px`,
          height: '40px',
        }}
      />
      {TABS.map(({ href, icon: Icon, label }, i) => {
        const isTarget = i === targetIndex;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={(e) => handleClick(e, href)}
            aria-label={label}
            className={`
              relative z-10 inline-flex items-center h-10 rounded-full pl-3 gap-1.5 overflow-hidden
              min-w-0 shrink-0 grow-0
              transition-[width,color] duration-300 ease-out will-change-[width]
              active:scale-95
              ${isTarget ? 'text-white' : 'text-zinc-400 hover:text-white'}
            `}
            style={{ width: isTarget ? `${EXPANDED}px` : `${COLLAPSED}px` }}
          >
            <Icon size={16} className="flex-shrink-0" />
            <span
              className={`
                text-sm font-semibold whitespace-nowrap
                transition-opacity duration-200
                ${isTarget ? 'opacity-100 delay-100' : 'opacity-0 pointer-events-none'}
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
