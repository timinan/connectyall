'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_CONTAINER } from '../_layout-constants';
import { LuCamera, LuX, LuCheck, LuPencil, LuStar } from 'react-icons/lu';
import { ChannelIcon, type ChannelKind } from '../cards/[id]/channel-icons';
import { PageHeader } from '@/components/page-header';
import { BottomNav } from '@/components/bottom-nav';
import { signOut } from '@/lib/auth/client';

type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string; phone?: string; instagram?: string; messenger?: string };
  telegramUsername: string | null;
  photoR2Url: string | null;
  onboardedAt: string | null;
};

type ProfileChannel = 'x' | 'linkedin' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'wechat' | 'line' | 'phone' | 'instagram' | 'messenger';

const PROFILE_CHANNELS: ProfileChannel[] = ['email', 'phone', 'telegram', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line', 'instagram', 'messenger'];

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
  instagram: 'Instagram',
  messenger: 'Messenger',
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
  instagram: 'instagram handle',
  messenger: 'messenger username',
};

function readChannel(profile: Profile, kind: ProfileChannel): string | null {
  if (kind === 'telegram') return profile.telegramUsername;
  return profile.socials[kind] ?? null;
}

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function Avatar({ profile }: { profile: { displayName: string; photoR2Url: string | null } | null }) {
  if (!profile) {
    return <div className="w-44 h-44 rounded-full bg-line" />;
  }
  if (profile.photoR2Url) {
    // Plain img — Next.js image optimization would require absolute URLs, not worth the complexity here
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.photoR2Url} alt={profile.displayName} className="w-44 h-44 rounded-full object-cover" />;
  }
  const initial = (profile.displayName.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      className="w-44 h-44 rounded-full flex items-center justify-center text-white text-5xl font-extrabold"
      style={{ backgroundColor: pickBg(profile.displayName) }}
    >
      {initial}
    </div>
  );
}

export function ProfileEditor({ initialProfile }: { initialProfile: Profile }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function saveBasics(updates: { displayName?: string; tagline?: string | null }) {
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(false);
    if (res.ok) {
      setProfile((p) => p ? { ...p, ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}), ...(updates.tagline !== undefined ? { tagline: updates.tagline } : {}) } : p);
    }
  }

  async function continueToRecord() {
    router.push('/app/record');
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

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  async function handleDelete() {
    if (deleteText.trim().toLowerCase() !== 'delete my account') return;
    setDeleting(true);
    const res = await fetch('/api/profile', { method: 'DELETE' });
    if (!res.ok) {
      alert('Could not delete your account. Try again.');
      setDeleting(false);
      return;
    }
    await signOut();
    router.push('/');
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

  return (
    <div className={APP_CONTAINER}>
      <PageHeader status="PROFILE" />

      <div className="relative">
        <div className="relative z-10 bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
            Your <span className="text-brand">profile</span>
          </h1>
        </div>

        <div className="flex flex-col items-center mt-2 pt-2 pb-10">
          {/* Inner wrapper is exactly avatar-sized so the glow centers ON THE AVATAR, not the block */}
          <div className="relative">
            <div
              aria-hidden
              className="glow-breathe pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(124, 92, 255, 0.16) 0%, rgba(124, 92, 255, 0.05) 60%, rgba(124, 92, 255, 0) 80%)' }}
            >
              <div className="glow-breathe-d1 absolute inset-[44px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.06)' }} />
              <div className="glow-breathe-d2 absolute inset-[88px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.12)' }} />
            </div>
            <div className="relative z-10 inline-block">
              <Avatar profile={profile ? { displayName: profile.displayName, photoR2Url: profile.photoR2Url } : null} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change photo"
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-neutral-950 text-white flex items-center justify-center shadow ring-2 ring-cream"
              >
                <LuCamera size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </div>
          </div>
        </div>

      <div className="relative z-10 space-y-4">
        <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-4 space-y-3">
          <div className="space-y-1">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold">NAME</div>
            <EditableLine
              value={profile?.displayName ?? ''}
              placeholder="Display name (Tim Nan)"
              onSave={(v) => saveBasics({ displayName: v })}
            />
          </div>
          <div className="border-t border-line" />
          <div className="space-y-1">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold">TITLE</div>
            <EditableLine
              value={profile?.tagline ?? ''}
              placeholder="One-liner (PM building crypto products)"
              onSave={(v) => saveBasics({ tagline: v || null })}
            />
          </div>
        </div>

        <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-4 space-y-2">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold mb-2">HOW PEOPLE CAN REACH YOU</div>
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
          type="button"
          onClick={continueToRecord}
          disabled={saving}
          className="w-full px-4 py-4 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:opacity-90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
        >
          {saving ? 'Saving…' : 'Start connecting'}
        </button>
      </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex-1 px-5 py-4 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-neutral-50 transition"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="flex-1 px-5 py-4 rounded-full bg-white border-[1.5px] border-red-600 text-red-600 font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-red-50 transition"
        >
          Delete account
        </button>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40">
          <div className="rounded-3xl bg-white shadow-xl max-w-sm w-full px-6 py-6 space-y-4">
            <p className="text-lg font-semibold text-neutral-950">Delete your account?</p>
            <p className="text-sm text-neutral-600">
              This removes your profile, every connection, every meeting, and every recording. You can&apos;t undo it.
            </p>
            <div>
              <label className="text-xs text-neutral-600 block mb-1">
                Type <strong>delete my account</strong> to confirm
              </label>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteText(''); }}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-neutral-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteText.trim().toLowerCase() !== 'delete my account'}
                className="flex-1 px-4 py-3 rounded-full bg-red-500 text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase hover:bg-red-600 transition disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function EditableLine({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next !== value) await onSave(next);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 rounded-lg bg-cream border border-line text-sm min-w-0"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          aria-label="Save"
          className="flex-shrink-0 p-1.5 rounded text-brand hover:bg-brand/10 transition"
        >
          <LuCheck size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
          aria-label="Cancel"
          className="flex-shrink-0 p-1.5 rounded text-neutral-500 hover:bg-neutral-100 transition"
        >
          <LuX size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="w-full text-left flex items-start gap-1.5 text-sm hover:text-neutral-950 transition-colors"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Tap to edit"
    >
      {value.trim() ? (
        <span className="text-neutral-700 flex-1">{value}</span>
      ) : (
        <span className="text-neutral-500 flex-1 italic">{placeholder}</span>
      )}
      <LuPencil size={14} className="text-neutral-400 flex-shrink-0 mt-0.5" />
    </button>
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
        className="flex-1 px-3 py-2 rounded-lg bg-cream border border-line text-sm"
      />
      <LuPencil size={13} className="text-neutral-400 flex-shrink-0" />
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
  const valueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected) valueInputRef.current?.focus();
  }, [selected]);

  if (available.length === 0) return null;

  async function handleAdd() {
    if (!selected || !value.trim()) return;
    await onAdd(selected, value.trim());
    setSelected('');
    setValue('');
    setExpanded(false);
  }

  function reset() {
    setSelected('');
    setValue('');
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#E9DDFF] text-brand font-mono text-[10px] tracking-[0.14em] font-bold uppercase"
      >
        + Add field
      </button>
    );
  }

  // Channel selected — show full channel row (star + icon + input + ADD + X)
  if (selected) {
    return (
      <div className="flex items-center gap-1 py-1">
        <button
          type="button"
          disabled
          aria-label="Preferred (sets after adding)"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center opacity-60"
        >
          <LuStar size={16} fill="none" color="#737373" />
        </button>
        <span className="w-6 flex items-center justify-center flex-shrink-0">
          <ChannelIcon kind={selected as ChannelKind} size={18} />
        </span>
        <input
          ref={valueInputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') reset();
          }}
          placeholder={PROFILE_CHANNEL_PLACEHOLDERS[selected]}
          className="flex-1 px-2 py-1 rounded-lg bg-cream border border-line text-neutral-950 text-sm min-w-0"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAdd}
          className="flex-shrink-0 px-3 py-1.5 rounded-full bg-brand text-white font-mono text-[10px] tracking-[0.14em] font-bold uppercase hover:opacity-90 transition"
        >
          Add
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={reset}
          aria-label="Cancel"
          className="flex-shrink-0 p-1.5 rounded text-neutral-500 hover:bg-neutral-100 transition"
        >
          <LuX size={16} />
        </button>
      </div>
    );
  }

  // No channel picked yet — show the dropdown
  return (
    <div className="flex items-center gap-2 w-full">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as ProfileChannel | '')}
        className="flex-1 bg-cream border border-line rounded-lg px-2 py-1.5 text-sm text-neutral-700"
        autoFocus
      >
        <option value="">Pick field…</option>
        {available.map((c) => <option key={c} value={c}>{PROFILE_CHANNEL_LABELS[c]}</option>)}
      </select>
      <button
        type="button"
        onClick={reset}
        className="flex-shrink-0 p-1.5 rounded text-neutral-500 hover:bg-neutral-100 transition"
        aria-label="Cancel"
      >
        <LuX size={16} />
      </button>
    </div>
  );
}
