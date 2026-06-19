import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';
import { ProfileEditor } from './profile-editor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');
  const user = await getById(session.user.id);
  if (!user) redirect('/app/sign-in');

  return (
    <ProfileEditor
      initialProfile={{
        displayName: user.displayName,
        tagline: user.tagline,
        shortBlurb: user.shortBlurb,
        socials: user.socials ?? {},
        telegramUsername: user.telegramUsername,
        photoR2Url: user.photoR2Url,
        onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
      }}
    />
  );
}
