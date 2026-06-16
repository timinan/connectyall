import { headers } from 'next/headers';
import { auth } from './server';

export async function getServerSession(): Promise<
  | { user: { id: string; email: string | null; emailVerified: boolean }; sessionId: string }
  | null
> {
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      emailVerified: session.user.emailVerified ?? false,
    },
    sessionId: session.session.id,
  };
}
