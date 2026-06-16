import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  insertValues,
  insertMock,
  selectLimit,
  selectWhere,
  selectFrom,
  selectMock,
  deleteWhere,
  deleteMock,
  updateSet,
  updateMock,
} = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValues });
  const selectLimit = vi.fn();
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const selectMock = vi.fn().mockReturnValue({ from: selectFrom });
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhere });
  const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });
  return {
    insertValues,
    insertMock,
    selectLimit,
    selectWhere,
    selectFrom,
    selectMock,
    deleteWhere,
    deleteMock,
    updateSet,
    updateMock,
  };
});

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, select: selectMock, delete: deleteMock, update: updateMock }),
}));

import { issueLinkToken, consumeLinkToken } from './TelegramLinkService';

describe('TelegramLinkService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issueLinkToken inserts a row and returns a token', async () => {
    const token = await issueLinkToken('user-1');
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(insertMock).toHaveBeenCalled();
  });

  it('consumeLinkToken sets users.telegramUserId and deletes the token row', async () => {
    selectLimit.mockResolvedValueOnce([{ token: 'abc', userId: 'user-1', expiresAt: new Date(Date.now() + 60000) }]);
    const ok = await consumeLinkToken('abc', 42, 'sarah');
    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
  });

  it('consumeLinkToken returns false for unknown token', async () => {
    selectLimit.mockResolvedValueOnce([]);
    const ok = await consumeLinkToken('bad', 42, 'sarah');
    expect(ok).toBe(false);
  });

  it('consumeLinkToken returns false for expired token', async () => {
    selectLimit.mockResolvedValueOnce([{ token: 'abc', userId: 'user-1', expiresAt: new Date(Date.now() - 60000) }]);
    const ok = await consumeLinkToken('abc', 42, 'sarah');
    expect(ok).toBe(false);
  });
});
