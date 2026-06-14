import { Inngest } from 'inngest';
import { env } from '../env';

export const inngest = new Inngest({
  id: 'connectyall',
  eventKey: env().INNGEST_EVENT_KEY,
});

export type CaptureEvent = {
  data: {
    userId: number;
    chatId: number;
    fileId: string;
    mimeType: string;
    kind: 'voice' | 'audio' | 'video';
  };
};
