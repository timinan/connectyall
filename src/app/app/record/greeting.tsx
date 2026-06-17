'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LuPencil } from 'react-icons/lu';

export function getFirstName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

type Profile = {
  displayName: string;
  photoR2Url: string | null;
};

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function Avatar({ profile }: { profile: Profile | null | 'loading' }) {
  if (profile === 'loading') {
    return <div className="w-24 h-24 rounded-full bg-neutral-800" />;
  }
  if (!profile) {
    return (
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold"
        style={{ backgroundColor: PALETTE[0] }}
      >
        ?
      </div>
    );
  }
  if (profile.photoR2Url) {
    return (
      <img
        src={profile.photoR2Url}
        alt={profile.displayName}
        className="w-24 h-24 rounded-full object-cover"
      />
    );
  }
  const initial = (profile.displayName.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold"
      style={{ backgroundColor: pickBg(profile.displayName) }}
    >
      {initial}
    </div>
  );
}

export function Greeting() {
  const [profile, setProfile] = useState<Profile | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setProfile(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setProfile(json.profile ?? null);
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const firstName = profile && profile !== 'loading' ? getFirstName(profile.displayName) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {profile !== 'loading' && (
        <h2 className="text-xl font-semibold text-center">
          {firstName ? `Hello, ${firstName} 👋` : 'Hello 👋'}
        </h2>
      )}
      <Link href="/app/profile" className="relative inline-block" aria-label="Edit profile">
        <Avatar profile={profile} />
        <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950">
          <LuPencil size={14} />
        </span>
      </Link>
    </div>
  );
}
