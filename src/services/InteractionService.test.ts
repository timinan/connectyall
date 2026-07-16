import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  insertReturning,
  insertValues,
  insertMock,
  updateReturning,
  updateWhere,
  updateSet,
  updateMock,
  selectLimit,
  selectWhere,
  selectFrom,
  selectMock,
} = vi.hoisted(() => {
  const insertReturning = vi.fn();
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const insertMock = vi.fn().mockReturnValue({ values: insertValues });

  // updateWhere returns an object with .returning() so callers can chain it
  const updateReturning = vi.fn().mockResolvedValue([{ id: 'int-1' }]);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });

  const selectLimit = vi.fn();
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const selectMock = vi.fn().mockReturnValue({ from: selectFrom });

  return {
    insertReturning,
    insertValues,
    insertMock,
    updateReturning,
    updateWhere,
    updateSet,
    updateMock,
    selectLimit,
    selectWhere,
    selectFrom,
    selectMock,
  };
});

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, update: updateMock, select: selectMock }),
}));

import { mintStub, markReady, markFailed, getStatus } from './InteractionService';

describe('InteractionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update returns a row (transition applied)
    updateReturning.mockResolvedValue([{ id: 'int-1' }]);
  });

  it('mintStub inserts a processing row and returns id', async () => {
    insertReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    const id = await mintStub('voice');
    expect(id).toBe('int-1');
    expect(insertMock).toHaveBeenCalled();
  });

  it('markReady updates interaction row and bumps contacts.lastTouchedAt', async () => {
    // First update (interaction) returns a row; second (contacts) also resolves
    updateReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    await markReady('int-1', 'contact-1', { recap: 'hi' });
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('markFailed updates status to failed', async () => {
    updateReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    await markFailed('int-1');
    expect(updateMock).toHaveBeenCalled();
  });

  it('getStatus returns the row', async () => {
    selectLimit.mockResolvedValueOnce([{ id: 'int-1', status: 'ready' }]);
    const r = await getStatus('int-1');
    expect(r?.status).toBe('ready');
  });
});

describe('mintStub with capture metadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists userId, audioR2Key, and mimeType when provided', async () => {
    insertReturning.mockResolvedValueOnce([{ id: 'int-2' }]);
    selectLimit.mockResolvedValueOnce([{ id: 'int-2', status: 'processing', contactId: null, structuredData: {} }]);
    const id = await mintStub('voice', {
      userId: '00000000-0000-0000-0000-000000000001',
      audioR2Key: 'captures/user-1/abc.webm',
      mimeType: 'audio/webm',
    });
    const row = await getStatus(id);
    expect(row).not.toBeNull();
    // The new fields are exposed via a sibling helper in step 5; for now this
    // assertion just guards that mintStub doesn't throw with the new signature.
    expect(typeof id).toBe('string');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '00000000-0000-0000-0000-000000000001',
        audioR2Key: 'captures/user-1/abc.webm',
        mimeType: 'audio/webm',
      }),
    );
  });
});

describe('InteractionService — status transition guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateReturning.mockResolvedValue([{ id: 'int-1' }]);
  });

  it('markFailed does not clobber a ready row', async () => {
    // Simulate: row is already 'ready', WHERE status='processing' matches nothing
    updateReturning.mockResolvedValueOnce([]);
    const applied = await markFailed('int-1');
    expect(applied).toBe(false);
  });

  it('markReady only applies to processing rows', async () => {
    // Simulate: row is already 'failed', WHERE status='processing' matches nothing
    updateReturning.mockResolvedValueOnce([]);
    const applied = await markReady('int-1', 'contact-1', {});
    expect(applied).toBe(false);
    // contacts.lastTouchedAt must NOT be bumped when transition didn't apply
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('markReady returns true and bumps contacts when transition applies', async () => {
    updateReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    const applied = await markReady('int-1', 'contact-1', { recap: 'hi' });
    expect(applied).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(2); // interaction + contact
  });

  it('markFailed returns true when transition applies', async () => {
    updateReturning.mockResolvedValueOnce([{ id: 'int-1' }]);
    const applied = await markFailed('int-1');
    expect(applied).toBe(true);
  });
});
