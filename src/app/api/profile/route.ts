import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { upsertProfile, setSocial, setPhotoFromBytes, getById } from '@/services/UserProfileService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
  tagline: z.string().max(140).nullable().optional(),
  selfIntro: z.string().max(280).nullable().optional(),
});

const SocialSchema = z.object({
  social: z.enum(['x', 'linkedin', 'email', 'website']),
  value: z.string().min(1).max(255),
});

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
    await setSocial(session.user.id, social.data.social, social.data.value);
    return NextResponse.json({ ok: true });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  }
  const user = await upsertProfile({ id: session.user.id, ...parsed.data });
  return NextResponse.json({ user });
}
