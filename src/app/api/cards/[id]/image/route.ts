import { NextResponse } from 'next/server';
import { downloadObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same-origin proxy for the R2-hosted card PNG. Reads via S3 SDK so it keeps
// working after the R2 bucket goes private. Not auth-gated — recipients of a
// /c/[id] share URL need to see the image without signing in.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bytes = await downloadObject(`cards/${id}.png`);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
