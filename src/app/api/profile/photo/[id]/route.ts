import { NextResponse } from 'next/server';
import { downloadObject } from '@/lib/r2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  for (const ext of ['png', 'jpg'] as const) {
    try {
      const bytes = await downloadObject(`profiles/${id}.${ext}`);
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          'Content-Type': ext === 'png' ? 'image/png' : 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      });
    } catch { /* try next ext */ }
  }
  return new NextResponse('Not found', { status: 404 });
}
