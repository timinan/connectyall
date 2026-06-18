'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
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

export default function ConnectionsPage() {
  const [rows, setRows] = useState<Connection[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/connections', { cache: 'no-store' });
      if (!res.ok) { setRows([]); return; }
      const json = await res.json();
      setRows(json.connections ?? []);
    })();
  }, []);

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
    // 'recent' keeps the server's lastTouchedAt DESC order
    return sorted;
  }, [rows, query, sort]);

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

      <ul className="space-y-3">
        {visible && visible.map((c) => {
          const sub = [c.company, c.role].filter(Boolean).join(' · ');
          return (
            <li key={c.contactId}>
              <Link
                href={`/app/connections/${c.contactId}`}
                className="flex items-center gap-3 p-3 rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm hover:border-purple-300 transition"
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
        })}
      </ul>
    </div>
  );
}
