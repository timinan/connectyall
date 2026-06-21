'use client';
import { useRef, useState, useCallback } from 'react';

// Single-handed swipe-left gesture for revealing a hidden right-side action
// slab. Returns the offset state + touch handlers to spread onto the swipeable
// element. Caller renders the slab themselves (e.g. a red DELETE button) at
// the same position they want revealed.
//
// Usage:
//   const { offset, handlers, reset } = useSwipeToReveal({ revealWidth: 86 });
//   <div style={{ transform: `translateX(${offset}px)` }} {...handlers}>...</div>

export function useSwipeToReveal(opts: { revealWidth: number }) {
  const [offset, setOffset] = useState(0);
  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);

  const handlers = {
    onTouchStart(e: React.TouchEvent) {
      startXRef.current = e.touches[0].clientX;
      startOffsetRef.current = offset;
    },
    onTouchMove(e: React.TouchEvent) {
      if (startXRef.current == null) return;
      const dx = e.touches[0].clientX - startXRef.current;
      const next = Math.min(0, Math.max(-opts.revealWidth, startOffsetRef.current + dx));
      setOffset(next);
    },
    onTouchEnd() {
      // Snap to either fully revealed or fully closed based on the midpoint.
      setOffset((current) => (current < -opts.revealWidth / 2 ? -opts.revealWidth : 0));
      startXRef.current = null;
    },
  };

  const reset = useCallback(() => setOffset(0), []);

  return { offset, handlers, reset, isRevealed: offset <= -opts.revealWidth };
}
