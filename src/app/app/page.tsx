import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';

export const dynamic = 'force-dynamic';

export default async function AppHomePage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');
  const profile = await getById(session.user.id);
  if (!profile || !profile.onboardedAt) redirect('/app/profile');
  redirect('/app/record');
}
