import { describe, it, expect, vi, beforeEach } from 'vitest';

const findStuckMock = vi.hoisted(() => vi.fn());
const processCaptureMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/CaptureService', () => ({
  findStuckProcessingCaptures: findStuckMock,
  processCapture: processCaptureMock,
}));

import { recoverStuckCapturesFn } from './functions';

describe('recoverStuckCapturesFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls processCapture for every stuck row the query returns', async () => {
    findStuckMock.mockResolvedValueOnce([
      { id: 'i-1', userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm' },
      { id: 'i-2', userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4' },
    ]);
    processCaptureMock.mockResolvedValue(undefined);

    // The handler ignores its event/step args for the cron path beyond running
    // a single step. We invoke the handler directly with a minimal step stub.
    const step = { run: (_id: string, fn: () => Promise<unknown>) => fn() };
    await (recoverStuckCapturesFn as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> })
      .fn({ step });

    expect(findStuckMock).toHaveBeenCalledWith({ maxAgeSeconds: 60, limit: 20 });
    expect(processCaptureMock).toHaveBeenCalledTimes(2);
    expect(processCaptureMock).toHaveBeenNthCalledWith(1, {
      userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm', interactionId: 'i-1',
    });
    expect(processCaptureMock).toHaveBeenNthCalledWith(2, {
      userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4', interactionId: 'i-2',
    });
  });

  it('catches per-row errors and keeps processing the rest', async () => {
    findStuckMock.mockResolvedValueOnce([
      { id: 'i-1', userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm' },
      { id: 'i-2', userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4' },
    ]);
    processCaptureMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const step = { run: (_id: string, fn: () => Promise<unknown>) => fn() };
    await (recoverStuckCapturesFn as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> })
      .fn({ step });

    expect(processCaptureMock).toHaveBeenCalledTimes(2);
  });
});
