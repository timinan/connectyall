import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, genericOAuthClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;
