import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from '@/lib/auth/session';
import { uploadBytes } from '@/lib/r2/client';
import { mintStub } from '@/services/InteractionService';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/webm'];

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'audio too large (>20MB)' }, { status: 400 });

  // file.type may include a codec like 'audio/webm;codecs=opus' — match on base mime only
  const baseMime = file.type.split(';')[0].trim();
  if (!ALLOWED_MIME.includes(baseMime)) return NextResponse.json({ error: `unsupported mime: ${file.type}` }, { status: 400 });

  const ext = baseMime.split('/').pop() ?? 'webm';
  const key = `captures/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await uploadBytes({ key, bytes, contentType: baseMime });

  const interactionId = await mintStub('voice');

  await inngest.send({
    name: 'capture/process',
    data: {
      userId: session.user.id,
      source: 'web',
      audio: { kind: 'r2-key', key, mimeType: file.type },
      preMintedInteractionId: interactionId,
      replyTo: { surface: 'web' },
    },
  });

  return NextResponse.json({ interactionId });
}
