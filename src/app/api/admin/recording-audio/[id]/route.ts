import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { interactions } from '@/lib/db/schema';
import { downloadObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = new Set(['tim.nan.91@gmail.com', 'timmy.nan@gmail.com']);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!session.user.email || !ADMIN_EMAILS.has(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const [row] = await db()
    .select({ audioR2Key: interactions.audioR2Key, mimeType: interactions.mimeType })
    .from(interactions)
    .where(eq(interactions.id, id))
    .limit(1);

  if (!row?.audioR2Key) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const bytes = await downloadObject(row.audioR2Key);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': row.mimeType ?? 'audio/webm',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
