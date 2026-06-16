import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { issueLinkToken } from '@/services/TelegramLinkService';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const token = await issueLinkToken(session.user.id);
  return NextResponse.json({
    url: `https://t.me/${env().TELEGRAM_BOT_USERNAME}?start=link_${token}`,
  });
}
