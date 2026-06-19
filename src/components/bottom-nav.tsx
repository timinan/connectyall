'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LuMic, LuUser, LuUsers } from 'react-icons/lu';

const TABS = [
  { href: '/app/profile', icon: LuUser, label: 'Profile', match: '/app/profile' },
  { href: '/app/record', icon: LuMic, label: 'Connect', match: '/app/record' },
  { href: '/app/connections', icon: LuUsers, label: 'Connections', match: '/app/connections' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistic "just tapped" so the new pill renders before the route commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (pendingHref && pathname.startsWith(pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  const targetHref =
    pendingHref ??
    TABS.find((t) => pathname.startsWith(t.match))?.href ??
    TABS[1].href;

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
      className="bnav-pin fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F0F12] text-white rounded-full p-1.5 flex gap-1 items-center shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
    >
      {TABS.map(({ href, icon: Icon, label }) => {
        const isTarget = href === targetHref;
        return isTarget ? (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={(e) => handleClick(e, href)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-brand text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            <Icon size={16} className="flex-shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        ) : (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={(e) => handleClick(e, href)}
            aria-label={label}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 transition-transform"
          >
            <Icon size={16} />
          </Link>
        );
      })}
    </nav>
  );
}
