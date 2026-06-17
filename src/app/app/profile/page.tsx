'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirstName } from '../record/greeting';

type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string };
  telegramUsername: string | null;
  onboardedAt: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

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
    await fetch('/api/profile', { method: 'PUT', body: fd });
  }

  async function setSocial(kind: string, value: string) {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ social: kind, value }),
    });
  }

  function headline() {
    if (!profile) return 'Hello';
    const firstName = getFirstName(profile.displayName);
    if (profile.onboardedAt) {
      return firstName
        ? `Hello, ${firstName}, please edit your profile below`
        : 'Hello, please edit your profile below';
    }
    return 'Hello, please set up your profile below';
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{headline()}</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); saveBasics(e.currentTarget); }}
        className="space-y-3"
      >
        <input
          name="displayName"
          placeholder="Display name (Tim Nan)"
          required
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          defaultValue={profile?.displayName ?? ''}
          key={`name-${profile?.displayName ?? ''}`}
        />
        <input
          name="tagline"
          placeholder="One-liner (PM building crypto products)"
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          defaultValue={profile?.tagline ?? ''}
          key={`tagline-${profile?.tagline ?? ''}`}
        />
        <textarea
          name="selfIntro"
          placeholder="Optional — extra context the AI uses for extraction"
          rows={2}
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
          className="block text-sm"
        />
        <div className="space-y-2">
          <label className="text-sm text-neutral-400">Socials (optional)</label>
          {(['x', 'linkedin', 'email', 'website'] as const).map((kind) => (
            <input
              key={`${kind}-${profile?.socials?.[kind] ?? ''}`}
              placeholder={kind}
              className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
              onBlur={(e) => e.target.value && setSocial(kind, e.target.value)}
              defaultValue={profile?.socials?.[kind] ?? ''}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Done — start recording'}
        </button>
      </form>
    </div>
  );
}
