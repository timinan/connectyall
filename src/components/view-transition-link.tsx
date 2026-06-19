'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * Drop-in replacement for next/link that wraps the navigation in
 * document.startViewTransition() when the browser supports it.
 *
 * Used to mask the blank-white flash on transitions between marketing /
 * auth / app pages, which are server-rendered and have a perceptible
 * loading window when you tap through them.
 */
export function ViewTransitionLink({ href, children, className }: Props) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;
    if (!supportsVT) return; // let Link handle navigation normally

    // External / hash / new-tab clicks should keep their default behavior.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (href.startsWith('http') || href.startsWith('#')) return;

    e.preventDefault();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).startViewTransition(() => router.push(href));
  }

  return (
    <Link href={href} onClick={handleClick} className={className} prefetch>
      {children}
    </Link>
  );
}
