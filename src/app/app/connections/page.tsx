'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch, LuX, LuTrash2 } from 'react-icons/lu';
import { APP_CONTAINER } from '../_layout-constants';
import { NavToggle } from '@/components/nav-toggle';
import { ChannelIcon, type ChannelKind } from '../cards/[id]/channel-icons';
import { relativeDate } from '@/lib/relative-date';

type Connection = {
  contactId: string;
  name: string;
  company: string | null;
  role: string | null;
  preferredChannel: ChannelKind | null;
  lastTouchedAt: string;
  meetingsCount: number;
};

type SortKey = 'recent' | 'first' | 'last';

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function firstNameKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0].toLowerCase();
}

function lastNameKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function Bubble({ name }: { name: string }) {
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
      style={{ backgroundColor: pickBg(name) }}
    >
      {letter}
    </div>
  );
}

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX_TRANSLATE = 120;
const HINT_STORAGE_KEY = 'connectyall:swipe-hint-dismissed';
const HINT_TIMEOUT_MS = 6000;

type RowProps = {
  c: Connection;
  onAskDelete: (c: Connection) => void;
};

function ConnectionRow({ c, onAskDelete }: RowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const intercepted = useRef(false);
  const sub = [c.company, c.role].filter(Boolean).join(' · ');

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    intercepted.current = false;
    setAnimating(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // If the gesture is more vertical than horizontal, let the page scroll.
    if (!intercepted.current && Math.abs(dy) > Math.abs(dx)) {
      startX.current = null;
      startY.current = null;
      return;
    }
    if (dx < 0) {
      intercepted.current = true;
      setTranslateX(Math.max(dx, -SWIPE_MAX_TRANSLATE));
    }
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    const passedThreshold = translateX <= -SWIPE_THRESHOLD;
    startX.current = null;
    startY.current = null;
    setAnimating(true);
    setTranslateX(0);
    if (passedThreshold) onAskDelete(c);
  }

  function onClick(e: React.MouseEvent) {
    // Suppress navigation if the row was just swiped — touchend resets translateX
    // to 0, so we read intercepted.current as the signal.
    if (intercepted.current) {
      e.preventDefault();
      intercepted.current = false;
    }
  }

  return (
    <li className="relative">
      {/* Red delete affordance behind the row */}
      <div
        className="absolute inset-0 rounded-3xl bg-red-500 flex items-center justify-end pr-6 pointer-events-none"
        style={{ opacity: Math.min(1, Math.abs(translateX) / SWIPE_THRESHOLD) }}
      >
        <LuTrash2 size={22} className="text-white" />
      </div>
      <Link
        href={`/app/connections/${c.contactId}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onClick}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: animating ? 'transform 0.2s ease-out' : 'none',
        }}
        className="relative flex items-center gap-3 p-3 rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm hover:border-purple-300"
      >
        <Bubble name={c.name} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-950 truncate">{c.name}</p>
          {sub && <p className="text-xs text-neutral-600 truncate">{sub}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {c.preferredChannel && <ChannelIcon kind={c.preferredChannel} size={16} />}
          <p className="text-xs text-neutral-600 whitespace-nowrap">{relativeDate(c.lastTouchedAt)}</p>
        </div>
      </Link>
    </li>
  );
}

function ConfirmDelete({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handleConfirm() {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40">
      <div className="rounded-3xl bg-white shadow-xl max-w-sm w-full px-6 py-6 space-y-4">
        <p className="text-lg font-semibold text-neutral-950">Delete {name}?</p>
        <p className="text-sm text-neutral-600">This will remove this connection and every meeting you have with them. You can&apos;t undo it.</p>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-full bg-white border border-neutral-200 text-neutral-950 text-sm font-semibold hover:bg-neutral-50 transition disabled:opacity-50"
          >
            No
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  const [rows, setRows] = useState<Connection[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [confirm, setConfirm] = useState<Connection | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/connections', { cache: 'no-store' });
      if (!res.ok) { setRows([]); return; }
      const json = await res.json();
      setRows(json.connections ?? []);
    })();
  }, []);

  // First-visit "swipe left to delete" hint — auto-fades after a few seconds
  // and stores a flag so it never shows again on this device.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HINT_STORAGE_KEY)) return;
    if (!rows || rows.length === 0) return;
    setHintVisible(true);
    const timer = window.setTimeout(() => {
      setHintVisible(false);
      window.localStorage.setItem(HINT_STORAGE_KEY, '1');
    }, HINT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [rows]);

  function dismissHint() {
    setHintVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HINT_STORAGE_KEY, '1');
    }
  }

  const visible = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company?.toLowerCase().includes(q) ?? false)
        )
      : rows;
    const sorted = [...filtered];
    if (sort === 'first') sorted.sort((a, b) => firstNameKey(a.name).localeCompare(firstNameKey(b.name)));
    else if (sort === 'last') sorted.sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name)));
    return sorted;
  }, [rows, query, sort]);

  async function deleteContact(id: string) {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Could not delete this connection. Try again.');
      return;
    }
    setRows((prev) => prev?.filter((c) => c.contactId !== id) ?? prev);
    setConfirm(null);
  }

  return (
    <div className={APP_CONTAINER}>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your connections</h1>
        <NavToggle />
      </div>

      {rows === null && <p className="text-neutral-600 text-sm">Loading…</p>}

      {rows && rows.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <LuSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or company"
              className="w-full pl-8 pr-8 py-2 rounded-full bg-white border border-neutral-200 text-sm placeholder:text-neutral-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-950"
              >
                <LuX size={14} />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white border border-neutral-200 rounded-full px-3 py-2 text-sm text-neutral-700"
          >
            <option value="recent">Recent</option>
            <option value="first">First name</option>
            <option value="last">Last name</option>
          </select>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-8 text-center space-y-3">
          <p className="text-neutral-700">No connections yet.</p>
          <Link href="/app/record" className="inline-block px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition">
            + Record your first
          </Link>
        </div>
      )}

      {visible && visible.length === 0 && rows && rows.length > 0 && (
        <p className="text-neutral-600 text-sm text-center py-6">No matches for &ldquo;{query}&rdquo;.</p>
      )}

      <button
        onClick={dismissHint}
        aria-hidden={!hintVisible}
        className={`w-full inline-flex items-center gap-2 px-3 py-2 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold hover:bg-amber-200 transition-opacity duration-500 ${hintVisible ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 py-0 overflow-hidden'}`}
      >
        <span>✨</span>
        <span className="flex-1 text-left">Tip: swipe left on a connection to delete it.</span>
        <LuX size={12} />
      </button>

      <ul className="space-y-3">
        {visible && visible.map((c) => (
          <ConnectionRow key={c.contactId} c={c} onAskDelete={setConfirm} />
        ))}
      </ul>

      {confirm && (
        <ConfirmDelete
          name={confirm.name}
          onConfirm={() => deleteContact(confirm.contactId)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
