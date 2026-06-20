import { inngest } from './client';
import { processCapture, findStuckProcessingCaptures } from '@/services/CaptureService';

// Cron-triggered janitor. Every 2 minutes, sweep the interactions table for
// rows that started processing more than 60 seconds ago and never reached
// 'ready' or 'failed'. Re-run the pipeline for each. Audio in R2 + the
// capture metadata on the row are the durable handoff from the fast path
// (`/api/capture` running processCapture inline via `after()`) to here.
export const recoverStuckCapturesFn = inngest.createFunction(
  { id: 'recover-stuck-captures', name: 'Recover stuck captures' },
  { cron: '*/2 * * * *' }, // every 2 minutes
  async ({ step }) => {
    const stuck = await step.run('find-stuck', () =>
      findStuckProcessingCaptures({ maxAgeSeconds: 60, limit: 20 }),
    );

    let recovered = 0;
    let failed = 0;
    for (const row of stuck) {
      try {
        await processCapture({
          userId: row.userId,
          audioR2Key: row.audioR2Key,
          mimeType: row.mimeType,
          interactionId: row.id,
        });
        recovered += 1;
      } catch (err) {
        // Don't let one bad row block the rest. processCapture's own retries
        // already covered transient failures; what bubbles up here is hard
        // and gets surfaced in Inngest dashboard logs.
        console.error('recover-stuck-captures: row failed', { interactionId: row.id, err });
        failed += 1;
      }
    }
    return { swept: stuck.length, recovered, failed };
  },
);

export const functions = [recoverStuckCapturesFn];
