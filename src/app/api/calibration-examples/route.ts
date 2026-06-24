import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import {
  listExamples,
  addExample,
  clearForUser,
  deleteExample,
} from '@/services/CalibrationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AddSchema = z.object({
  transcript: z.string().min(1).max(4000),
  expectedJson: z.unknown(),
});

const DeleteQuerySchema = z.object({ id: z.string().uuid().optional() });

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const examples = await listExamples(session.user.id);
  return NextResponse.json({ examples });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = AddSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const example = await addExample({
    userId: session.user.id,
    transcript: parsed.data.transcript,
    expectedJson: parsed.data.expectedJson,
  });
  return NextResponse.json({ example }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const parsed = DeleteQuerySchema.safeParse({ id: url.searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  if (parsed.data.id) {
    await deleteExample(session.user.id, parsed.data.id);
  } else {
    await clearForUser(session.user.id);
  }
  return new NextResponse(null, { status: 204 });
}
