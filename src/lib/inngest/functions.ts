import { inngest } from './client';
import { processCapture, findStuckProcessingCaptures } from '@/services/CaptureService';
import { markFailed } from '@/services/InteractionService';

// Cron-triggered janitor. Sweep the interactions table for rows that started
// processing more than 60 seconds ago and never reached 'ready' or 'failed'.
// Re-run the pipeline for each. Audio in R2 + the capture metadata on the row
// are the durable handoff from the fast path (`/api/capture` running
// processCapture inline via `after()`) to here.
export const recoverStuckCapturesFn = inngest.createFunction(
  { id: 'recover-stuck-captures', name: 'Recover stuck captures' },
  // Cadence must exceed Neon's autosuspend delay or the DB never sleeps and
  // burns the free-plan compute allowance. Users already see failures within
  // ~60s via the inline markFailed; this sweep is only crash recovery.
  { cron: '*/15 * * * *' },
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
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[janitor] row failed (interactionId=${row.id}) — ${msg}`);
        failed += 1;
        // If the recording has been stuck for more than 30 minutes, give up.
        // The user can re-record. This caps the blast radius of permanently
        // broken rows (corrupt audio, hard model errors, etc.) so the janitor
        // doesn't churn on them forever.
        const ageMs = Date.now() - new Date(row.occurredAt).getTime();
        if (ageMs > 30 * 60 * 1000) {
          try {
            await markFailed(row.id);
            console.error(`[janitor] giving up after 30min (interactionId=${row.id})`);
          } catch (markErr) {
            const markMsg = markErr instanceof Error ? markErr.message : String(markErr);
            console.error(`[janitor] markFailed also failed (interactionId=${row.id}) — ${markMsg}`);
          }
        }
      }
    }
    console.log(`[janitor] sweep complete: swept=${stuck.length} recovered=${recovered} failed=${failed}`);
    return { swept: stuck.length, recovered, failed };
  },
);

export const functions = [recoverStuckCapturesFn];
