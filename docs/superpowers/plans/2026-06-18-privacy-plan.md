# Privacy Hardening — Implementation Plan

> Use `superpowers:subagent-driven-development` to execute task-by-task.

**Goal:** Lock R2 audio behind credentials, give users a self-serve account-delete, and stand up `/privacy` + `/terms`.

**Architecture:**
- 4 tasks, sequential. No DB migrations.
- One Cloudflare dashboard change happens *after* merge (Tim flips bucket Public Access OFF).
- The code paths fall back gracefully on existing data — old captures stay invisible (good), Tim's existing profile photo will need re-upload (acceptable single-user impact).

---

### Task 1: Private R2 reads + user-prefixed audio

**Files:**
- Modify: `src/lib/r2/client.ts`
- Modify: `src/services/CaptureService.ts`
- Modify: `src/app/api/cards/[id]/image/route.ts`
- Modify: `src/app/api/capture/route.ts`

**Step 1: Add three helpers to `src/lib/r2/client.ts`.**

The file already has an authenticated `S3Client`. Add `GetObjectCommand`, `DeleteObjectCommand`, and `ListObjectsV2Command` to the imports:

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
```

Then add at the bottom of the file:

```ts
export async function downloadObject(key: string): Promise<Uint8Array> {
  const e = env();
  const res = await s3().send(new GetObjectCommand({ Bucket: e.R2_BUCKET_NAME, Key: key }));
  if (!res.Body) throw new Error(`R2: empty body for ${key}`);
  const bytes = await res.Body.transformToByteArray();
  return bytes;
}

export async function deleteObject(key: string): Promise<void> {
  const e = env();
  await s3().send(new DeleteObjectCommand({ Bucket: e.R2_BUCKET_NAME, Key: key }));
}

export async function listObjects(prefix: string): Promise<string[]> {
  const e = env();
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({ Bucket: e.R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) if (obj.Key) out.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
```

**Step 2: Swap `CaptureService.downloadFromR2()` to use the SDK.**

Currently in `src/services/CaptureService.ts`:

```ts
async function downloadFromR2(key: string): Promise<Uint8Array> {
  const url = `${env().R2_PUBLIC_URL_BASE}/${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
```

Replace the function with:

```ts
async function downloadFromR2(key: string): Promise<Uint8Array> {
  return downloadObject(key);
}
```

Add the import at the top of the file:

```ts
import { downloadObject } from '../lib/r2/client';
```

**Step 3: Swap `/api/cards/[id]/image/route.ts` to use the SDK.**

Currently fetches the public R2 URL. Replace the entire file with:

```ts
import { NextResponse } from 'next/server';
import { downloadObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same-origin proxy for the R2-hosted card PNG. Reads via S3 SDK so it keeps
// working after the R2 bucket goes private. Not auth-gated — recipients of a
// /c/[id] share URL need to see the image without signing in.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bytes = await downloadObject(`cards/${id}.png`);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
```

**Step 4: User-prefix the audio key in `src/app/api/capture/route.ts`.**

Find:

```ts
const key = `captures/${randomUUID()}.${ext}`;
```

Replace with:

```ts
const key = `captures/${session.user.id}/${randomUUID()}.${ext}`;
```

**Step 5: Verify**

```
pnpm typecheck
pnpm test
pnpm build
```

All clean.

**Step 6: Commit (short, lowercase, no co-authored-by):**

```bash
git add src/lib/r2/client.ts src/services/CaptureService.ts src/app/api/cards/[id]/image/route.ts src/app/api/capture/route.ts
git commit -m "read R2 via S3 SDK + user-prefix audio captures"
```

---

### Task 2: Profile photo proxy + public landing fix

**Files:**
- Create: `src/app/api/profile/photo/[id]/route.ts`
- Modify: `src/lib/r2/client.ts` (return value of `uploadPhoto`)
- Modify: `src/services/CardService.ts` (inline photo bytes server-side)
- Modify: `src/app/c/[id]/page.tsx` (image src + OG meta switch to proxy URL)

**Step 1: Create the profile photo proxy.**

Path: `src/app/api/profile/photo/[id]/route.ts`. The endpoint takes a user ID, tries `.png` first then `.jpg`, returns the bytes. Not auth-gated — profile photos are baked into shareable card PNGs anyway, so they're not secret.

```ts
import { NextResponse } from 'next/server';
import { downloadObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  for (const ext of ['png', 'jpg'] as const) {
    try {
      const bytes = await downloadObject(`profiles/${id}.${ext}`);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': ext === 'png' ? 'image/png' : 'image/jpeg',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    } catch { /* try next ext */ }
  }
  return new NextResponse('Not found', { status: 404 });
}
```

**Step 2: Change what `uploadPhoto` returns.**

In `src/lib/r2/client.ts`, the existing `uploadPhoto` returns `${R2_PUBLIC_URL_BASE}/${input.key}`. That URL dies once the bucket goes private. Switch to returning the proxy path instead.

The key passed in is `profiles/<userId>.<ext>`. The proxy is at `/api/profile/photo/<userId>`. Derive the userId from the key:

Find:

```ts
export async function uploadPhoto(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const e = env();
  await s3().send(
    new PutObjectCommand({
      Bucket: e.R2_BUCKET_NAME,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
    })
  );
  return `${e.R2_PUBLIC_URL_BASE}/${input.key}`;
}
```

Replace with:

```ts
export async function uploadPhoto(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const e = env();
  await s3().send(
    new PutObjectCommand({
      Bucket: e.R2_BUCKET_NAME,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
    })
  );
  // Profile photos: serve via the same-origin proxy so the bucket can stay private.
  // For other uploads (cards), we keep returning the public URL — those are served
  // via a separate proxy route.
  if (input.key.startsWith('profiles/')) {
    const filename = input.key.slice('profiles/'.length).split('.')[0]; // userId
    return `/api/profile/photo/${filename}`;
  }
  return `${e.R2_PUBLIC_URL_BASE}/${input.key}`;
}
```

(The `uploadBytes` alias for card PNGs continues to work because the function still falls through to the public URL for non-`profiles/` keys.)

**Step 3: Make `CardService` inline the photo as a data URL instead of relying on a network fetch.**

`CardService.renderCard` passes `photoR2Url` to satori as the `src` of an `img` element. Satori fetches that URL when rendering. If the URL is now `/api/profile/photo/<userId>` (relative), satori can't resolve it. If the URL is absolute and points to a private R2 bucket, it can't fetch it either.

Cleanest fix: read the photo bytes server-side via `downloadObject`, inline as a `data:` URL.

In `src/services/CardService.ts`, find the block that builds the `photo` node:

```ts
const photo = input.profile.photoR2Url
  ? {
      type: 'img',
      props: {
        src: input.profile.photoR2Url,
        width: PHOTO,
        height: PHOTO,
        style: { borderRadius: PHOTO / 2, objectFit: 'cover' },
      },
    }
  : {
      type: 'div',
      ...
```

The function's `input.profile` doesn't carry the user's id, only the photoR2Url string. The cleanest pattern: extract the userId by parsing the proxy URL the same way `uploadPhoto` builds it.

At the top of `renderCard`, before building the tree, derive the photo bytes:

```ts
async function loadPhotoDataUrl(photoR2Url: string | null): Promise<string | null> {
  if (!photoR2Url) return null;
  // Photo URLs from uploadPhoto are now `/api/profile/photo/<userId>`. Parse the
  // userId, fetch the bytes via SDK, return a data: URL for satori.
  const match = photoR2Url.match(/^\/api\/profile\/photo\/([^/]+)$/);
  if (!match) {
    // Legacy public R2 URL (pre-private-bucket). Try a passthrough — works until
    // Tim flips the bucket private, after which the photo just falls back to the
    // initial-bubble.
    return photoR2Url;
  }
  const userId = match[1];
  for (const ext of ['png', 'jpg'] as const) {
    try {
      const { downloadObject } = await import('../lib/r2/client');
      const bytes = await downloadObject(`profiles/${userId}.${ext}`);
      const b64 = Buffer.from(bytes).toString('base64');
      return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${b64}`;
    } catch { /* try next */ }
  }
  return null;
}
```

Then in `renderCard`, call it once at the top:

```ts
const photoDataUrl = await loadPhotoDataUrl(input.profile.photoR2Url);
```

And update the `photo` block to use `photoDataUrl` instead of `input.profile.photoR2Url`:

```ts
const photo = photoDataUrl
  ? {
      type: 'img',
      props: {
        src: photoDataUrl,
        width: PHOTO,
        height: PHOTO,
        style: { borderRadius: PHOTO / 2, objectFit: 'cover' },
      },
    }
  : {
      // ... existing initial-bubble fallback unchanged ...
    };
```

**Step 4: Update `src/app/c/[id]/page.tsx` to use the proxy URL.**

The file references `cardUrl` (the R2 public URL) in two places — once in `generateMetadata` (OG image), once in the page body (the `<img>` element).

Find both occurrences of:

```ts
const cardUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${found.interaction.id}.png`;
```

and:

```ts
const cardUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`;
```

Replace each with:

```ts
const cardUrl = `${env().BASE_URL}/api/cards/${found.interaction.id}/image`;
```

and respectively:

```ts
const cardUrl = `${env().BASE_URL}/api/cards/${interaction.id}/image`;
```

Both `BASE_URL` and the proxy route already exist. The OG image now points at our proxy (Facebook/Twitter/iMessage fetch it from there); the on-page `<img>` does too.

**Step 5: Verify**

```
pnpm typecheck
pnpm test
pnpm build
```

All clean. (Existing tests don't touch the photo data URL path; nothing to add.)

**Step 6: Commit:**

```bash
git add src/app/api/profile/photo src/lib/r2/client.ts src/services/CardService.ts src/app/c/[id]/page.tsx
git commit -m "proxy profile photos + inline into card render"
```

---

### Task 3: Delete account — API + UI

**Files:**
- Modify: `src/app/api/profile/route.ts` (add `DELETE` handler)
- Modify: `src/app/app/profile/page.tsx` (Delete button + confirm modal)

**Step 1: Add the `DELETE` handler.**

In `src/app/api/profile/route.ts`, append a new `DELETE` export below the existing `PUT`:

```ts
import { deleteObject, listObjects } from '@/lib/r2/client';

export async function DELETE() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  // 1. Find every card PNG owned by this user (one per interaction).
  const interactionRows = await db()
    .select({ id: interactions.id })
    .from(interactions)
    .innerJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(eq(contacts.userId, userId));

  // 2. Delete card PNGs from R2.
  for (const row of interactionRows) {
    try { await deleteObject(`cards/${row.id}.png`); } catch { /* already gone, ignore */ }
  }

  // 3. Delete the user's audio captures (everything under their prefix).
  const audioKeys = await listObjects(`captures/${userId}/`);
  for (const k of audioKeys) {
    try { await deleteObject(k); } catch { /* ignore */ }
  }

  // 4. Delete the user's profile photo (try both extensions).
  for (const ext of ['png', 'jpg']) {
    try { await deleteObject(`profiles/${userId}.${ext}`); } catch { /* ignore */ }
  }

  // 5. Delete the user row. Contacts/interactions/sessions cascade via FK.
  await db().delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
```

Add these imports to the top of the file if not already present:

```ts
import { contacts, interactions } from '@/lib/db/schema';
```

`users` is likely already imported. `db`, `eq`, `getServerSession` should already be there.

**Step 2: Add the Delete button + confirmation modal to profile page.**

In `src/app/app/profile/page.tsx`:

a) Add state at the top of `ProfilePage`:

```ts
const [showDelete, setShowDelete] = useState(false);
const [deleteText, setDeleteText] = useState('');
const [deleting, setDeleting] = useState(false);
```

b) Add the delete handler:

```ts
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
```

c) Find the existing "Sign out" button (added in the instant-recording branch). Right below it, add:

```tsx
<button
  type="button"
  onClick={() => setShowDelete(true)}
  className="block mx-auto text-sm text-red-600 hover:text-red-700 transition pt-1"
>
  Delete my account
</button>
```

d) At the very end of the page wrapper (just before the outermost closing `</div>`), add the confirmation modal:

```tsx
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
          className="flex-1 px-4 py-2 rounded-full bg-white border border-neutral-200 text-neutral-950 text-sm font-semibold hover:bg-neutral-50 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting || deleteText.trim().toLowerCase() !== 'delete my account'}
          className="flex-1 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 3: Verify**

```
pnpm typecheck
pnpm test
pnpm build
```

All clean.

**Step 4: Commit:**

```bash
git add src/app/api/profile/route.ts src/app/app/profile/page.tsx
git commit -m "delete-my-account flow with typed confirmation"
```

---

### Task 4: `/privacy`, `/terms`, footer links

**Files:**
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`
- Modify: `src/components/footer.tsx`

**Step 1: Create `/privacy`.**

`src/app/privacy/page.tsx`:

```tsx
import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Privacy · Connectyall' };

export default function PrivacyPage() {
  return (
    <main className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
      </header>
      <article className="max-w-2xl mx-auto py-8 space-y-5 text-neutral-700 text-base leading-relaxed">
        <h1 className="text-3xl font-bold text-neutral-950">Privacy</h1>
        <p>Connectyall keeps it simple. You record voice memos about people you meet. We turn those into structured contact info you can pass along and look up later. Here&apos;s exactly what happens with your data.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your sign-in email and a profile (display name, tagline, optional photo, optional social handles).</li>
          <li>Voice recordings you make in the app.</li>
          <li>The extracted structured info from those recordings (names, companies, channels, recap notes).</li>
          <li>Basic sign-in metadata (IP address and user-agent, kept by the auth system for session security).</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What we do with it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Send the audio to Cloudflare Workers AI (Whisper) for transcription.</li>
          <li>Send the transcript to Google Gemini for structured extraction.</li>
          <li>Store the structured info in our database (Neon Postgres) so you can browse it.</li>
          <li>Send sign-in codes to your inbox via Resend.</li>
        </ul>
        <p>Audio is processed and stored. We don&apos;t share it with anyone. We don&apos;t use it to train any model.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What you can do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>View and edit everything from your profile and connection pages.</li>
          <li>Delete your entire account (profile + connections + recordings) from the profile page — instant and permanent.</li>
          <li>Sign out from any device — your session ends, your data stays.</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Where the data sits</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cloudflare R2</strong> — audio + card images, private to your account.</li>
          <li><strong>Neon Postgres</strong> — your profile, contacts, and meeting recaps.</li>
          <li><strong>Vercel</strong> — hosting, function execution.</li>
          <li><strong>Resend</strong> — sign-in email delivery.</li>
          <li><strong>Cloudflare Workers AI</strong> — transcription only; not used for training.</li>
          <li><strong>Google Gemini</strong> — extraction only; not used for training.</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Retention</h2>
        <p>Your data stays until you delete your account. Then it&apos;s gone — from our database immediately, from R2 within an hour.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Questions</h2>
        <p>Email <a href="mailto:tim.nan.91@gmail.com" className="text-brand underline">tim.nan.91@gmail.com</a>.</p>
        <p className="text-sm text-neutral-500 pt-6">Last updated: June 18, 2026.</p>
      </article>
    </main>
  );
}
```

**Step 2: Create `/terms`.**

`src/app/terms/page.tsx`:

```tsx
import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Terms · Connectyall' };

export default function TermsPage() {
  return (
    <main className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
      </header>
      <article className="max-w-2xl mx-auto py-8 space-y-5 text-neutral-700 text-base leading-relaxed">
        <h1 className="text-3xl font-bold text-neutral-950">Terms</h1>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Connectyall is a beta.</h2>
        <p>One person built it as a portfolio project. Use it because you like the idea — please don&apos;t expect enterprise-grade uptime.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Your data is yours.</h2>
        <p>We don&apos;t sell it. We don&apos;t share it. We don&apos;t use it to train models. You can export it (email us) and delete it (button on profile).</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Be cool about other people.</h2>
        <p>The whole point of Connectyall is that you record info about people you meet. <strong>Please get their okay before you do.</strong> Recording voice memos about someone without their knowledge isn&apos;t illegal in most places but it&apos;s not great form. Connectyall is for &ldquo;Sarah and I just exchanged numbers, here&apos;s a voice note while it&apos;s fresh&rdquo; — not for covertly profiling strangers.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">No warranty.</h2>
        <p>The app might break. Recordings might fail. Extractions might mis-spell a name. We&apos;ll fix bugs as we find them, but we don&apos;t guarantee anything.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">We can change these terms.</h2>
        <p>If something material changes (data uses, who we share with, etc.) we&apos;ll send you a sign-in email about it.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Questions</h2>
        <p>Email <a href="mailto:tim.nan.91@gmail.com" className="text-brand underline">tim.nan.91@gmail.com</a>.</p>
        <p className="text-sm text-neutral-500 pt-6">Last updated: June 18, 2026.</p>
      </article>
    </main>
  );
}
```

**Step 3: Add the footer links.**

In `src/components/footer.tsx`, find the existing JSX that renders `connectyall · Voice notes that connect y'all.`. Add `Privacy` and `Terms` links to the right of the tagline.

Today's footer interior probably looks like:

```tsx
<Link href="/" className="inline-flex items-center gap-2 ...">
  <LogoMark size={20} />
  <span className="text-sm font-bold ...">connectyall</span>
</Link>
<span className="text-slate-500">·</span>
<p className="text-xs text-slate-300">Voice notes that connect y&apos;all.</p>
```

Append after the tagline:

```tsx
<span className="text-slate-500 hidden sm:inline">·</span>
<a href="/privacy" className="text-xs text-slate-300 hover:text-white transition hidden sm:inline">Privacy</a>
<span className="text-slate-500 hidden sm:inline">·</span>
<a href="/terms" className="text-xs text-slate-300 hover:text-white transition hidden sm:inline">Terms</a>
```

(The `hidden sm:inline` keeps the mobile footer uncluttered — links show on tablet/desktop. On mobile, the links are still reachable from the profile page if we want to add them there later, or they could fall back to always-visible if you prefer. **Default: hidden on mobile.** Mention in the merge convo if you want them always visible.)

**Step 4: Verify**

```
pnpm typecheck
pnpm test
pnpm build
```

All clean.

**Step 5: Commit:**

```bash
git add src/app/privacy src/app/terms src/components/footer.tsx
git commit -m "privacy + terms pages with footer links"
```

---

## Final verification

```
pnpm typecheck && pnpm test && pnpm build
```

Push, deploy, sync inngest. Tim flips R2 Public Access OFF in the Cloudflare dashboard. Smoke-test on production using the table in the spec.
