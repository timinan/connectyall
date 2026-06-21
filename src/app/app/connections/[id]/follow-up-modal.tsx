'use client';
import { useState, useEffect } from 'react';
import type { FollowUp } from '@/lib/db/schema';

type Mode = 'edit' | 'add';

type Props = {
  mode: Mode;
  contactName: string;
  initial?: FollowUp;
  onClose: () => void;
  onSave: (input: { topic: string; dueAt: Date | null }) => Promise<void>;
  onMarkDone?: () => Promise<void>;
};

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function noonOf(d: Date): Date {
  const next = new Date(d);
  next.setUTCHours(12, 0, 0, 0);
  return next;
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function formatDateInputValue(d: Date): string {
  // <input type="date"> expects YYYY-MM-DD in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const QUICK_PICKS: Array<{ label: string; days: number | null }> = [
  { label: 'TOMORROW', days: 1 },
  { label: 'IN 3 DAYS', days: 3 },
  { label: 'NEXT WEEK', days: 7 },
  { label: 'NO DATE', days: null },
];

export function FollowUpModal({ mode, contactName, initial, onClose, onSave, onMarkDone }: Props) {
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [dueAt, setDueAt] = useState<Date | null>(
    initial?.dueAt ? new Date(initial.dueAt) : (mode === 'add' ? noonOf(addDays(new Date(), 1)) : null),
  );
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Close on escape
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pickQuick(days: number | null) {
    if (days === null) {
      setDueAt(null);
    } else {
      setDueAt(noonOf(addDays(new Date(), days)));
    }
    setShowCustom(false);
  }

  async function handleSave() {
    if (!topic.trim()) return;
    setSaving(true);
    await onSave({ topic: topic.trim(), dueAt });
    setSaving(false);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:p-6 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl rounded-b-2xl shadow-xl w-full max-w-sm p-5 pb-4 space-y-3">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-bold">
          {mode === 'edit' ? 'EDIT FOLLOW-UP' : 'NEW FOLLOW-UP'}
        </div>
        <h2 className="text-xl font-extrabold text-neutral-950 leading-tight">For {contactName}</h2>

        <div>
          <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted font-bold mb-1.5">TOPIC</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What do you want to circle back about?"
            className="w-full px-3 py-2 rounded-lg bg-cream border border-line text-[14px] text-neutral-950 placeholder:text-muted"
            autoFocus
          />
        </div>

        <div>
          <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted font-bold mb-1.5">DUE DATE</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_PICKS.map((p) => {
              const isSelected =
                (p.days === null && dueAt === null) ||
                (p.days !== null && dueAt !== null && Math.round((dueAt.getTime() - new Date().getTime()) / 86_400_000) === p.days - 1);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pickQuick(p.days)}
                  className={`font-mono text-[9.5px] tracking-[0.14em] font-bold uppercase px-2.5 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-[#E9DDFF] text-brand border-[#E9DDFF]'
                      : 'bg-cream text-neutral-950 border-line'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {dueAt !== null && (
            <div className="flex items-center gap-2 bg-cream border border-line rounded-lg px-3 py-2">
              <span className="font-mono text-[12px] tracking-[0.12em] font-bold uppercase text-neutral-950">
                {formatDateDisplay(dueAt)}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowCustom((v) => !v)}
                className="font-mono text-[9.5px] tracking-[0.14em] font-bold uppercase text-brand"
              >
                CUSTOM {showCustom ? '▴' : '▾'}
              </button>
            </div>
          )}
          {showCustom && dueAt !== null && (
            <input
              type="date"
              value={formatDateInputValue(dueAt)}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                if (y && m && d) setDueAt(new Date(y, m - 1, d, 12, 0, 0));
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-cream border border-line text-[14px]"
            />
          )}
        </div>

        {mode === 'edit' && onMarkDone && (
          <div className="flex items-center justify-center pt-3 mt-3 border-t border-line">
            <button
              type="button"
              onClick={async () => { await onMarkDone(); onClose(); }}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-brand font-bold"
            >
              ✓ MARK AS DONE
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !topic.trim()}
            className="flex-1 px-4 py-3 rounded-full bg-brand text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 shadow-[0_16px_36px_rgba(124,92,255,0.32),0_2px_6px_rgba(124,92,255,0.18)]"
          >
            {mode === 'edit' ? 'SAVE' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}
