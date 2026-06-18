import { redirect, notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getServerSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OldCardDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');

  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) redirect('/app/connections');
  if (found.contact.userId !== session.user.id) notFound();

  redirect(`/app/connections/${found.contact.id}`);
}
