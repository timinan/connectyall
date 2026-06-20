import { Inngest } from 'inngest';
import { env } from '../env';

export const inngest = new Inngest({
  id: 'connectyall',
  eventKey: env().INNGEST_EVENT_KEY,
});
