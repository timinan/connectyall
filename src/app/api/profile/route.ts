import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { setSocial, clearSocial, setPhotoFromBytes, getById } from '@/services/UserProfileService';
import { db } from '@/lib/db/client';
import { contacts, interactions, users } from '@/lib/db/schema';
import { linkedinHandle, xHandle, telegramHandle, instagramHandle, messengerHandle } from '@/lib/social-urls';
import { deleteObject, listObjects } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  tagline: z.string().max(140).nullable().optional(),
  shortBlurb: z.string().max(100).nullable().optional(),
  selfIntro: z.string().max(280).nullable().optional(),
});

const ChannelEnum = z.enum(['x', 'linkedin', 'email', 'website', 'telegram', 'whatsapp', 'wechat', 'line', 'phone', 'instagram', 'messenger']);

const SocialSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    social: ChannelEnum,
    value: z.string().min(1).max(255),
  }),
  z.object({
    action: z.literal('clear'),
    social: ChannelEnum,
  }),
]);

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await getById(session.user.id);
  return NextResponse.json({ profile });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return NextResponse.json({ error: 'photo file required' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await setPhotoFromBytes(session.user.id, bytes, file.type);
    return NextResponse.json({ photoR2Url: url });
  }

  const body = await req.json();

  const social = SocialSchema.safeParse(body);
  if (social.success) {
    const { action, social: kind } = social.data;
    if (action === 'clear') {
      if (kind === 'telegram') {
        await db().update(users).set({ telegramUsername: null }).where(eq(users.id, session.user.id));
      } else {
        await clearSocial(session.user.id, kind as Exclude<typeof kind, 'telegram'>);
      }
      return NextResponse.json({ ok: true });
    }
    // action === 'set'
    let value = social.data.value;
    if (kind === 'linkedin') value = linkedinHandle(value);
    else if (kind === 'x') value = xHandle(value);
    else if (kind === 'telegram') value = telegramHandle(value);
    else if (kind === 'instagram') value = instagramHandle(value);
    else if (kind === 'messenger') value = messengerHandle(value);
    if (kind === 'telegram') {
      await db().update(users).set({ telegramUsername: value }).where(eq(users.id, session.user.id));
    } else {
      await setSocial(session.user.id, kind, value);
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  }
  // Only update fields that were actually sent — supports partial tap-to-edit saves
  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
  if (parsed.data.tagline !== undefined) updates.tagline = parsed.data.tagline;
  if (parsed.data.shortBlurb !== undefined) updates.shortBlurb = parsed.data.shortBlurb;
  if (parsed.data.selfIntro !== undefined) updates.selfIntro = parsed.data.selfIntro;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }
  await db().update(users).set({ ...updates, onboardedAt: new Date() }).where(eq(users.id, session.user.id));
  const user = await getById(session.user.id);
  return NextResponse.json({ user });
}

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

  // 2. Delete card PNGs from R2 (best-effort — ignore if any are already gone).
  for (const row of interactionRows) {
    try { await deleteObject(`cards/${row.id}.png`); } catch { /* already gone, ignore */ }
  }

  // 3. Delete the user's audio captures (everything under their user-prefixed path).
  const audioKeys = await listObjects(`captures/${userId}/`);
  for (const k of audioKeys) {
    try { await deleteObject(k); } catch { /* ignore */ }
  }

  // 4. Delete the user's profile photo. Try both extensions.
  for (const ext of ['png', 'jpg']) {
    try { await deleteObject(`profiles/${userId}.${ext}`); } catch { /* ignore */ }
  }

  // 5. Delete the user row. Contacts → interactions → sessions cascade via FK.
  await db().delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
