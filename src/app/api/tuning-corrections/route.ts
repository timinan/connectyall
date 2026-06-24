import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import {
  listRecentCorrections,
  clearCorrectionsForUser,
  deleteCorrection,
} from '@/services/CorrectionsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DeleteQuerySchema = z.object({ id: z.string().uuid().optional() });

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const corrections = await listRecentCorrections(session.user.id, 50);
  return NextResponse.json({ corrections });
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const parsed = DeleteQuerySchema.safeParse({ id: url.searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  if (parsed.data.id) {
    await deleteCorrection(session.user.id, parsed.data.id);
  } else {
    await clearCorrectionsForUser(session.user.id);
  }
  return new NextResponse(null, { status: 204 });
}
