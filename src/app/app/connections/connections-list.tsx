'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch, LuX, LuTrash2, LuPlus, LuMic } from 'react-icons/lu';
import { APP_CONTAINER_FLEX } from '../_layout-constants';
import { PageHeader } from '@/components/page-header';
import { BottomNav } from '@/components/bottom-nav';
import { type ChannelKind } from '../cards/[id]/channel-icons';
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

// Initials colors — alternating brand purple / black, deterministic per name
const INITIALS_COLORS = ['#7C5CFF', '#0A0A0A'];
function pickInitialsColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return INITIALS_COLORS[h % INITIALS_COLORS.length];
}
function makeInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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

function relativeDateMono(iso: string): string {
  return relativeDate(iso).toUpperCase();
}

const CHANNEL_TAG: Record<ChannelKind, string> = {
  email: 'EMAIL',
  phone: 'PH',
  telegram: 'TG',
  x: 'X',
  linkedin: 'IN',
  website: 'WEB',
  whatsapp: 'WA',
  wechat: 'WC',
  line: 'LINE',
};

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
  const subParts: string[] = [];
  if (c.role) subParts.push(c.role);
  if (c.company) subParts.push(c.company);
  const subText = subParts.join(' · ');
  const tag = c.preferredChannel ? CHANNEL_TAG[c.preferredChannel] : null;
  const initials = makeInitials(c.name);
  const initialsColor = pickInitialsColor(c.name);

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
    if (intercepted.current) {
      e.preventDefault();
      intercepted.current = false;
    }
  }

  return (
    <li className="relative">
      <div
        className="absolute inset-0 rounded-r-2xl bg-red-500 flex items-center justify-end pr-6 pointer-events-none"
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
        className="relative flex items-center gap-4 pl-4 pr-4 py-4 rounded-r-2xl bg-white border-l-4 border-brand shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] transition-shadow"
      >
        <div
          className="text-[30px] font-black tracking-tight leading-none min-w-[52px] flex-shrink-0"
          style={{ color: initialsColor }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[15px] text-neutral-950 truncate">{c.name}</p>
          {subText && (
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted font-semibold uppercase truncate mt-1">
              {subText}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="font-mono text-[10px] tracking-[0.18em] text-neutral-400 font-semibold uppercase">{relativeDateMono(c.lastTouchedAt)}</span>
          {tag && (
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-brand font-bold uppercase bg-[#E9DDFF] px-2 py-1 rounded">
              {tag}
            </span>
          )}
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
        <p className="text-lg font-bold text-neutral-950">Delete {name}?</p>
        <p className="text-sm text-muted">This will remove this connection and every meeting you have with them. You can&apos;t undo it.</p>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-full bg-white border border-line text-neutral-950 text-sm font-bold hover:bg-neutral-50 transition disabled:opacity-50"
          >
            No
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GlowRings() {
  return (
    <div
      aria-hidden
      className="glow-breathe absolute w-[300px] h-[300px] rounded-full pointer-events-none"
      style={{
        background: 'radial-gradient(circle, rgba(124, 92, 255, 0.18) 0%, rgba(124, 92, 255, 0.05) 60%, rgba(124, 92, 255, 0) 80%)',
      }}
    >
      <div className="glow-breathe-d1 absolute inset-[34px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.07)' }} />
      <div className="glow-breathe-d2 absolute inset-[66px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.14)' }} />
    </div>
  );
}

export function ConnectionsList({ initialConnections }: { initialConnections: Connection[] }) {
  const [rows, setRows] = useState<Connection[]>(initialConnections);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [confirm, setConfirm] = useState<Connection | null>(null);
  const [hintMounted, setHintMounted] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HINT_STORAGE_KEY)) return;
    if (rows.length === 0) return;
    setHintMounted(true);
    setHintVisible(true);
    const fadeTimer = window.setTimeout(() => {
      setHintVisible(false);
      window.localStorage.setItem(HINT_STORAGE_KEY, '1');
    }, HINT_TIMEOUT_MS);
    return () => window.clearTimeout(fadeTimer);
  }, [rows]);

  useEffect(() => {
    if (hintVisible || !hintMounted) return;
    const t = window.setTimeout(() => setHintMounted(false), 500);
    return () => window.clearTimeout(t);
  }, [hintVisible, hintMounted]);

  function dismissHint() {
    setHintVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HINT_STORAGE_KEY, '1');
    }
  }

  const visible = useMemo(() => {
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
    setRows((prev) => prev.filter((c) => c.contactId !== id));
    setConfirm(null);
  }

  const status = `${rows.length} ${rows.length === 1 ? 'PERSON' : 'PEOPLE'}`;

  return (
    <div className={APP_CONTAINER_FLEX}>
      <PageHeader status={status} />

      <div className="mt-4 bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
          Your <span className="text-brand">connections</span>
        </h1>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <LuSearch size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, roles, tags…"
              className="w-full pl-10 pr-10 py-2.5 rounded-full bg-surface border border-line text-sm placeholder:text-muted shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-neutral-950"
              >
                <LuX size={14} />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-surface border border-line rounded-full px-3 py-2.5 text-sm text-muted shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
          >
            <option value="recent">Recent</option>
            <option value="first">First name</option>
            <option value="last">Last name</option>
          </select>
        </div>
      )}

      {rows.length === 0 && (
        <div className="flex-1 flex flex-col gap-8 pt-3">
          <div>
            <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <h2 className="text-4xl font-black leading-[1.02] tracking-tight">
                Your<br />
                <span className="text-brand">network awaits.</span>
              </h2>
            </div>
            <div className="mt-4 pl-5 font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted">
              ● NOBODY HERE YET
            </div>
            <p className="mt-2 pl-5 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">
              Record your first voice memo and they&apos;ll show up here automatically.
            </p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center">
              <GlowRings />
              <Link
                href="/app/record"
                className="relative z-10 inline-flex items-center gap-2 px-7 py-5 rounded-full bg-brand text-white font-bold text-base shadow-[0_14px_36px_rgba(124,92,255,0.40)]"
              >
                <LuMic size={20} /> Record your first
              </Link>
            </div>
          </div>
        </div>
      )}

      {visible && visible.length === 0 && rows.length > 0 && (
        <p className="text-muted text-sm text-center py-6">No matches for &ldquo;{query}&rdquo;.</p>
      )}

      {hintMounted && (
        <button
          onClick={dismissHint}
          aria-hidden={!hintVisible}
          className={`mt-4 w-full inline-flex items-center gap-2 px-3 py-2 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px] tracking-[0.18em] uppercase font-semibold hover:bg-amber-200 transition-opacity duration-500 ${hintVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <span>✨</span>
          <span className="flex-1 text-left">SWIPE LEFT TO DELETE</span>
          <LuX size={12} />
        </button>
      )}

      {visible && visible.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visible.map((c) => (
            <ConnectionRow key={c.contactId} c={c} onAskDelete={setConfirm} />
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmDelete
          name={confirm.name}
          onConfirm={() => deleteContact(confirm.contactId)}
          onCancel={() => setConfirm(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}
