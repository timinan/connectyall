import { inngest } from './client';
import { processCapture } from '@/services/CaptureService';

export const processCaptureFn = inngest.createFunction(
  { id: 'process-capture', name: 'Process capture pipeline' },
  { event: 'capture/process' },
  async ({ event, step }) => {
    await step.run('process', () => processCapture(event.data));
    return { ok: true };
  }
);

export const functions = [processCaptureFn];
