'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_CONTAINER } from '../_layout-constants';
import { Avatar, getFirstName } from '../record/greeting';
import { LuCamera, LuX, LuCheck } from 'react-icons/lu';
import { ChannelIcon, type ChannelKind } from '../cards/[id]/channel-icons';

type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string; phone?: string };
  telegramUsername: string | null;
  photoR2Url: string | null;
  onboardedAt: string | null;
};

type ProfileChannel = 'x' | 'linkedin' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'wechat' | 'line' | 'phone';

const PROFILE_CHANNELS: ProfileChannel[] = ['email', 'phone', 'telegram', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line'];

const PROFILE_CHANNEL_LABELS: Record<ProfileChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
  website: 'Website',
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  line: 'Line',
};

const PROFILE_CHANNEL_PLACEHOLDERS: Record<ProfileChannel, string> = {
  email: 'email@example.com',
  phone: '+1 555 1234',
  telegram: 'handle (no @)',
  x: 'x handle',
  linkedin: 'linkedin handle',
  website: 'website.com',
  whatsapp: 'phone digits (e.g. 14155551234)',
  wechat: 'WeChat ID',
  line: 'Line ID',
};

function readChannel(profile: Profile, kind: ProfileChannel): string | null {
  if (kind === 'telegram') return profile.telegramUsername;
  return profile.socials[kind] ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.profile);
      }
    })();
  }, []);

  async function saveBasics(form: HTMLFormElement) {
    setSaving(true);
    const fd = new FormData(form);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: fd.get('displayName'),
        tagline: fd.get('tagline') || null,
        selfIntro: fd.get('selfIntro') || null,
      }),
    });
    setSaving(false);
    if (res.ok) router.push('/app/record');
  }

  async function uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/profile', { method: 'PUT', body: fd });
    if (!res.ok) return;
    const { photoR2Url } = await res.json();
    setProfile((p) => (p ? { ...p, photoR2Url } : p));
  }

  async function saveChannel(kind: ProfileChannel, value: string) {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', social: kind, value }),
    });
    setProfile((p) => {
      if (!p) return p;
      if (kind === 'telegram') return { ...p, telegramUsername: value };
      return { ...p, socials: { ...p.socials, [kind]: value } };
    });
  }

  async function clearChannel(kind: ProfileChannel) {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', social: kind }),
    });
    setProfile((p) => {
      if (!p) return p;
      if (kind === 'telegram') return { ...p, telegramUsername: null };
      const next = { ...p.socials };
      delete next[kind as keyof Profile['socials']];
      return { ...p, socials: next };
    });
  }

  function headline(): React.ReactNode {
    if (!profile) return 'Hello';
    const firstName = getFirstName(profile.displayName);
    if (profile.onboardedAt) {
      return firstName
        ? <>Hey <span className="text-brand">{firstName}</span>, keep your details fresh.</>
        : 'Keep your details fresh.';
    }
    return <><span className="text-brand">Welcome.</span> Let&apos;s set up how people reach you.</>;
  }

  return (
    <div className={APP_CONTAINER}>
      <form
        onSubmit={(e) => { e.preventDefault(); saveBasics(e.currentTarget); }}
        className="space-y-4"
      >
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-5 space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="relative inline-block">
              <Avatar
                profile={profile ? { displayName: profile.displayName, photoR2Url: profile.photoR2Url } : 'loading'}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change photo"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-neutral-950 text-white flex items-center justify-center shadow ring-2 ring-white"
              >
                <LuCamera size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </div>
            <h1 className="text-2xl font-bold text-center">{headline()}</h1>
          </div>
          <label className="text-sm text-neutral-700 font-medium block">Your info</label>
          <input
            name="displayName"
            placeholder="Display name (Tim Nan)"
            required
            className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200"
            defaultValue={profile?.displayName ?? ''}
            key={`name-${profile?.displayName ?? ''}`}
          />
          <input
            name="tagline"
            placeholder="One-liner (PM building crypto products)"
            className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200"
            defaultValue={profile?.tagline ?? ''}
            key={`tagline-${profile?.tagline ?? ''}`}
          />
          <textarea
            name="selfIntro"
            placeholder="Optional — extra context the AI uses for extraction"
            rows={2}
            className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200"
          />
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-4 space-y-2">
          <label className="text-sm text-neutral-700 font-medium block">How people can reach you</label>
          {profile && PROFILE_CHANNELS.filter((k) => {
            const v = readChannel(profile, k);
            return v !== null && v !== '';
          }).map((kind) => (
            <ChannelRow
              key={`${kind}-${readChannel(profile, kind)}`}
              kind={kind}
              initialValue={readChannel(profile, kind) ?? ''}
              onSave={(v) => saveChannel(kind, v)}
              onClear={() => clearChannel(kind)}
            />
          ))}
          {profile && (
            <AddChannel
              existing={PROFILE_CHANNELS.filter((k) => {
                const v = readChannel(profile, k);
                return v !== null && v !== '';
              })}
              onAdd={saveChannel}
            />
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold disabled:opacity-50 hover:bg-neutral-800 transition"
        >
          {saving ? 'Saving…' : 'Save and start connecting'}
        </button>
      </form>
    </div>
  );
}

function ChannelRow({
  kind,
  initialValue,
  onSave,
  onClear,
}: {
  kind: ProfileChannel;
  initialValue: string;
  onSave: (v: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center flex-shrink-0">
        <ChannelIcon kind={kind as ChannelKind} size={18} />
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value.trim() && value !== initialValue) onSave(value.trim()); }}
        placeholder={PROFILE_CHANNEL_PLACEHOLDERS[kind]}
        className="flex-1 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm"
      />
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${PROFILE_CHANNEL_LABELS[kind]}`}
        className="text-neutral-500 hover:text-neutral-950 p-2"
      >
        <LuX size={16} />
      </button>
    </div>
  );
}

function AddChannel({
  existing,
  onAdd,
}: {
  existing: ProfileChannel[];
  onAdd: (kind: ProfileChannel, value: string) => Promise<void>;
}) {
  const available = PROFILE_CHANNELS.filter((c) => !existing.includes(c));
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ProfileChannel | ''>('');
  const [value, setValue] = useState('');

  if (available.length === 0) return null;

  async function handleAdd() {
    if (!selected || !value.trim()) return;
    await onAdd(selected, value.trim());
    setSelected('');
    setValue('');
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-200 bg-white text-neutral-950 text-xs"
      >
        + Add field
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as ProfileChannel | '')}
        className="bg-white border border-neutral-200 rounded px-2 py-2 text-sm text-neutral-600"
        autoFocus
      >
        <option value="">Pick field…</option>
        {available.map((c) => <option key={c} value={c}>{PROFILE_CHANNEL_LABELS[c]}</option>)}
      </select>
      {selected && (
        <>
          <span className="flex items-center justify-center flex-shrink-0">
            <ChannelIcon kind={selected as ChannelKind} size={18} />
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={PROFILE_CHANNEL_PLACEHOLDERS[selected]}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Save"
            className="p-2 text-neutral-950"
          >
            <LuCheck size={18} />
          </button>
        </>
      )}
    </div>
  );
}
