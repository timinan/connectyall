import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { upsertProfile, setSocial, clearSocial, setPhotoFromBytes, getById } from '@/services/UserProfileService';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { linkedinHandle, xHandle, telegramHandle } from '@/lib/social-urls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
  tagline: z.string().max(140).nullable().optional(),
  selfIntro: z.string().max(280).nullable().optional(),
});

const ChannelEnum = z.enum(['x', 'linkedin', 'email', 'website', 'telegram', 'whatsapp', 'wechat', 'line', 'phone']);

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
  const user = await upsertProfile({ id: session.user.id, ...parsed.data });
  // Mark the user as onboarded the first time they save their basics
  await db().update(users).set({ onboardedAt: new Date() }).where(eq(users.id, session.user.id));
  return NextResponse.json({ user });
}
