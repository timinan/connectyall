import { NextResponse } from 'next/server';
import { bot } from '@/lib/telegram/bot';
// import '@/lib/telegram/onboarding'; // re-enable in Task 14
// import '@/lib/telegram/capture';    // re-enable in Task 17

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const update = await req.json();
  await bot().handleUpdate(update);
  return NextResponse.json({ ok: true });
}
