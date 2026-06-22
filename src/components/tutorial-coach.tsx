'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';

type CoachPosition = {
  top?: number;
  bottom?: number;
  left?: number | 'center';
  right?: number;
  arrow: 'top-l' | 'top-r' | 'top-c' | 'bottom-l' | 'bottom-c' | 'bottom-r';
};

export function TutorialCoach({
  step,
  totalSteps,
  title,
  body,
  ctaLabel,
  onDismiss,
  onSkip,
  position,
  anchorRef,
  anchorRadius = 12,
}: {
  step: number;
  totalSteps: number;
  title: string;
  body: ReactNode;
  ctaLabel: string;
  onDismiss: () => void;
  onSkip: () => void;
  position: CoachPosition;
  anchorRef?: RefObject<HTMLElement | null>;
  anchorRadius?: number;
}) {
  const [ringRect, setRingRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchorRef?.current) return;
    function updateRect() {
      const rect = anchorRef!.current?.getBoundingClientRect();
      if (rect) setRingRect(rect);
    }
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [anchorRef]);

  const tooltipStyle: React.CSSProperties = {};
  if (position.top !== undefined) tooltipStyle.top = position.top;
  if (position.bottom !== undefined) tooltipStyle.bottom = position.bottom;
  if (position.right !== undefined) tooltipStyle.right = position.right;
  if (position.left === 'center') {
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translateX(-50%)';
  } else if (position.left !== undefined) {
    tooltipStyle.left = position.left;
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden onClick={onDismiss} />

      {ringRect && (
        <div
          aria-hidden
          className="fixed z-[61] pointer-events-none border-2 border-dashed border-brand"
          style={{
            top: ringRect.top - 6,
            left: ringRect.left - 6,
            width: ringRect.width + 12,
            height: ringRect.height + 12,
            borderRadius: anchorRadius,
            boxShadow: '0 0 0 3px rgba(124, 92, 255, 0.18)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        className="fixed z-[62] bg-[#0F0F12] text-white rounded-2xl px-4 py-3 shadow-[0_18px_40px_rgba(15,15,18,0.45)] w-[244px]"
        style={tooltipStyle}
      >
        <Arrow position={position.arrow} />
        <div className="font-mono text-[9px] tracking-[0.2em] font-bold uppercase text-[#E9DDFF] mb-1">
          ● STEP {step} OF {totalSteps}
        </div>
        <div className="text-[15px] font-extrabold leading-tight tracking-tight mb-1.5">{title}</div>
        <div className="text-[12px] leading-snug text-[#C5C2D6] mb-2.5">{body}</div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="font-mono text-[9px] tracking-[0.18em] uppercase font-bold text-neutral-400 hover:text-white transition"
          >
            Skip tutorial
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="bg-brand text-white rounded-full px-3.5 py-1.5 font-mono text-[10px] tracking-[0.16em] font-bold uppercase hover:opacity-90 transition"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </>
  );
}

function Arrow({ position }: { position: CoachPosition['arrow'] }) {
  const base = 'absolute w-3.5 h-3.5 bg-[#0F0F12] rotate-45';
  const map: Record<CoachPosition['arrow'], string> = {
    'top-l': 'top-[-6px] left-7',
    'top-c': 'top-[-6px] left-1/2 -translate-x-1/2',
    'top-r': 'top-[-6px] right-7',
    'bottom-l': 'bottom-[-6px] left-7',
    'bottom-c': 'bottom-[-6px] left-1/2 -translate-x-1/2',
    'bottom-r': 'bottom-[-6px] right-7',
  };
  return <div aria-hidden className={`${base} ${map[position]}`} />;
}
