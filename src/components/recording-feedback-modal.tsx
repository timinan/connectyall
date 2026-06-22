'use client';

import { useState } from 'react';

type Step = 'rating' | 'comment';

export function RecordingFeedbackModal({
  interactionId,
  onResolved,
  onSkip,
}: {
  interactionId: string;
  onResolved: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<Step>('rating');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(rating: 'correct' | 'incorrect', body?: string) {
    setSubmitting(true);
    try {
      await fetch('/api/recording-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, rating, comment: body }),
      });
    } finally {
      setSubmitting(false);
      onResolved();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-black/40"
    >
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm px-5 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-brand font-bold">
            <span className="mr-1">●</span> QUICK CHECK
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-neutral-500 hover:text-neutral-950 font-bold transition disabled:opacity-50"
          >
            Skip
          </button>
        </div>

        {step === 'rating' && (
          <>
            <h2 className="text-xl font-extrabold text-neutral-950 leading-tight">
              Did we get this right?
            </h2>
            <p className="text-[14px] text-neutral-600 leading-relaxed">
              Take a quick look at the contact card. If anything looks off — wrong name, missing channel, garbled recap — let us know so we can fix it.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => submit('correct')}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-full bg-brand text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:opacity-90 transition disabled:opacity-50 shadow-[0_12px_30px_rgba(124,92,255,0.35),0_2px_6px_rgba(124,92,255,0.18)]"
              >
                Looks good
              </button>
              <button
                type="button"
                onClick={() => setStep('comment')}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-neutral-50 transition disabled:opacity-50"
              >
                Got it wrong
              </button>
            </div>
          </>
        )}

        {step === 'comment' && (
          <>
            <h2 className="text-xl font-extrabold text-neutral-950 leading-tight">
              What did we miss?
            </h2>
            <p className="text-[13px] text-neutral-600 leading-relaxed">
              e.g. <em>&quot;Wrong name — she said Sarah, not Sara&quot;</em> · <em>&quot;Missed her LinkedIn&quot;</em> · <em>&quot;Got the company wrong&quot;</em>
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              autoFocus
              rows={3}
              placeholder="Tell us what went wrong (optional)"
              className="w-full px-3 py-2 rounded-xl bg-cream border border-line text-sm resize-none focus:outline-none focus:border-brand"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('rating')}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-neutral-50 transition disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('incorrect', comment.trim() || undefined)}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-full bg-brand text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:opacity-90 transition disabled:opacity-50 shadow-[0_12px_30px_rgba(124,92,255,0.35),0_2px_6px_rgba(124,92,255,0.18)]"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
