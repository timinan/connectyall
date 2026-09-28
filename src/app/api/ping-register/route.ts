import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPingUser } from '@/lib/ping/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(255),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'valid email and a password of at least 8 characters required' }, { status: 400 });
  }
  try {
    const result = await createPingUser(parsed.data.email.toLowerCase(), parsed.data.password);
    if (result === 'exists') {
      return NextResponse.json({ error: 'an account with this email already exists' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ping-register] failed', err);
    // PingOne password policy rejections surface as a 400 from the password
    // set call — give the user something actionable without leaking internals.
    const msg = err instanceof Error && /password set failed/.test(err.message)
      ? 'password does not meet the policy (try longer, with mixed characters)'
      : 'could not create the account, try again';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
