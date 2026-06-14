import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';
import { env } from '@/lib/env';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: env().INNGEST_SIGNING_KEY,
});
