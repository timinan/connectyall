import { NextResponse, after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from '@/lib/auth/session';
import { uploadBytes } from '@/lib/r2/client';
import { mintStub } from '@/services/InteractionService';
import { processCapture } from '@/services/CaptureService';

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
  const audioR2Key = `captures/${session.user.id}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await uploadBytes({ key: audioR2Key, bytes, contentType: baseMime });

  // Mint the stub WITH capture metadata. If the inline pipeline drops, the
  // janitor will find this row and re-run processCapture against the same
  // audio still sitting in R2.
  const interactionId = await mintStub('voice', {
    userId: session.user.id,
    audioR2Key,
    mimeType: baseMime,
  });

  // Inline pipeline: keep running after the response goes back to the phone.
  // Any thrown error here is caught so the function exits cleanly; the row
  // stays at status='processing' and the janitor picks it up within 2 min.
  after(
    processCapture({
      userId: session.user.id,
      audioR2Key,
      mimeType: baseMime,
      interactionId,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[capture] inline processCapture failed (interactionId=${interactionId}); janitor will retry within 2min — ${msg}`);
    }),
  );

  return NextResponse.json({ interactionId });
}
