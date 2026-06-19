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

// Fixed geometry — used both for indicator math and for explicit tab widths.
const COLLAPSED = 40;
const EXPANDED = 148;
const GAP = 4;
const PADDING = 6;
const TAB_HEIGHT = 40;
const NAV_HEIGHT = TAB_HEIGHT + PADDING * 2;
const NAV_WIDTH = PADDING * 2 + EXPANDED + COLLAPSED * 2 + GAP * 2;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistic "just tapped" — drives the indicator + active tab before the route commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (pendingHref && pathname.startsWith(pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  const targetHref =
    pendingHref ??
    TABS.find((t) => pathname.startsWith(t.match))?.href ??
    TABS[1].href;
  const targetIndex = Math.max(0, TABS.findIndex((t) => t.href === targetHref));

  // Position each tab absolutely — flex's min-width:auto can't shrink content with
  // whitespace-nowrap labels, so we sidestep flex layout entirely for the tabs.
  function tabLeft(i: number): number {
    let left = PADDING;
    for (let j = 0; j < i; j++) {
      left += (j === targetIndex ? EXPANDED : COLLAPSED) + GAP;
    }
    return left;
  }

  const indicatorLeft = tabLeft(targetIndex);

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
      aria-label="Primary"
      className="bnav-pin fixed bottom-5 left-1/2 z-40 bg-[#0F0F12] rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
      style={{
        width: `${NAV_WIDTH}px`,
        height: `${NAV_HEIGHT}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Sliding purple indicator behind the active tab */}
      <span
        aria-hidden
        className="absolute bg-brand rounded-full transition-[left] duration-300 ease-out pointer-events-none"
        style={{
          left: `${indicatorLeft}px`,
          top: `${PADDING}px`,
          width: `${EXPANDED}px`,
          height: `${TAB_HEIGHT}px`,
        }}
      />
      {/* Tabs — absolutely positioned so flex's min-width:auto can't grow them */}
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
              absolute inline-flex items-center overflow-hidden rounded-full
              transition-[left,width,color] duration-300 ease-out
              active:scale-95
              ${isTarget ? 'text-white' : 'text-zinc-400 hover:text-white'}
            `}
            style={{
              left: `${tabLeft(i)}px`,
              top: `${PADDING}px`,
              width: isTarget ? `${EXPANDED}px` : `${COLLAPSED}px`,
              height: `${TAB_HEIGHT}px`,
              paddingLeft: '12px',
              gap: '6px',
              zIndex: 10,
            }}
          >
            <Icon size={16} className="flex-shrink-0" />
            {isTarget && (
              <span
                key={`${href}-label`}
                className="text-sm font-semibold whitespace-nowrap animate-bnav-label"
              >
                {label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
