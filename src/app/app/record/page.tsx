import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';
import { RecordClient } from './record-client';

export const dynamic = 'force-dynamic';

export default async function RecordPage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');
  const user = await getById(session.user.id);
  if (!user) redirect('/app/sign-in');
  if (!user.onboardedAt) redirect('/app/profile');

  return <RecordClient displayName={user.displayName} />;
}
