import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same-origin proxy for the R2-hosted card PNG so the PWA's `fetch()` doesn't fail CORS.
// The card asset itself isn't sensitive (the public landing page also references it),
// so we don't gate this behind auth.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r2Url = `${env().R2_PUBLIC_URL_BASE}/cards/${id}.png`;
  const res = await fetch(r2Url);
  if (!res.ok) return new NextResponse('Not found', { status: res.status });

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
