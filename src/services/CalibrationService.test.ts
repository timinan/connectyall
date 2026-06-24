import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.hoisted(() => vi.fn());
const insertReturning = vi.hoisted(() => vi.fn());
const deleteWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectOrderBy = vi.hoisted(() => vi.fn());
const selectLimit = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/db/client', () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  insertReturning.mockResolvedValue([{ id: 'ex-1', userId: 'u-1', transcript: 't', expectedJson: {}, createdAt: new Date() }]);
  insertValues.mockReturnValue({ returning: insertReturning });
  deleteWhere.mockResolvedValue(undefined);
  selectLimit.mockResolvedValue([]);
  selectOrderBy.mockReturnValue({ limit: selectLimit });
  selectWhere.mockReturnValue({ orderBy: selectOrderBy });
  selectFrom.mockReturnValue({ where: selectWhere });
  dbMock.mockReturnValue({
    insert: () => ({ values: insertValues }),
    delete: () => ({ where: deleteWhere }),
    select: () => ({ from: selectFrom }),
  });
});

import { listExamples, addExample, clearForUser } from './CalibrationService';

describe('listExamples', () => {
  it('returns examples ordered + limited', async () => {
    selectLimit.mockResolvedValueOnce([{ id: 'ex-1' }, { id: 'ex-2' }]);
    const out = await listExamples('u-1', 3);
    expect(out).toHaveLength(2);
    expect(selectLimit).toHaveBeenCalledWith(3);
  });
});

describe('addExample', () => {
  it('throws on empty transcript', async () => {
    await expect(addExample({ userId: 'u-1', transcript: '   ', expectedJson: {} })).rejects.toThrow(/empty/);
  });

  it('inserts when below cap', async () => {
    selectLimit.mockResolvedValueOnce([]); // existing list empty
    await addExample({ userId: 'u-1', transcript: 'Met Sarah', expectedJson: { name: 'Sarah' } });
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('drops oldest before inserting when at cap', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      id: `ex-${i}`,
      userId: 'u-1',
      transcript: `t${i}`,
      expectedJson: {},
      createdAt: new Date(2026, 5, 24 - i),
    }));
    selectLimit.mockResolvedValueOnce(existing);
    await addExample({ userId: 'u-1', transcript: 'fresh', expectedJson: {} });
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});

describe('clearForUser', () => {
  it('deletes all for the user', async () => {
    await clearForUser('u-1');
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
