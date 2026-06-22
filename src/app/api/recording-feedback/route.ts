import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { captureDiagnostics, interactions, contacts } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  interactionId: z.string().uuid(),
  rating: z.enum(['correct', 'incorrect']),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  // Sanity check the interaction belongs to this user before we stamp anything.
  const [row] = await db()
    .select({ interactionId: interactions.id })
    .from(interactions)
    .innerJoin(contacts, eq(interactions.contactId, contacts.id))
    .where(and(eq(interactions.id, parsed.data.interactionId), eq(contacts.userId, session.user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db()
    .update(captureDiagnostics)
    .set({
      userFeedbackRating: parsed.data.rating,
      userFeedbackText: parsed.data.comment ?? null,
      feedbackSubmittedAt: new Date(),
    })
    .where(eq(captureDiagnostics.interactionId, parsed.data.interactionId));

  return new NextResponse(null, { status: 204 });
}
