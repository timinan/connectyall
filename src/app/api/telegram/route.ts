import { NextResponse } from 'next/server';
import { bot } from '@/lib/telegram/bot';
import '@/lib/telegram/onboarding';
import '@/lib/telegram/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const update = await req.json();
  await bot().handleUpdate(update);
  return NextResponse.json({ ok: true });
}
