import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.hoisted(() => vi.fn());
const insertOnConflict = vi.hoisted(() => vi.fn());
const deleteWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectOrderBy = vi.hoisted(() => vi.fn());
const selectLimit = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/db/client', () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  insertOnConflict.mockResolvedValue(undefined);
  insertValues.mockReturnValue({ onConflictDoUpdate: insertOnConflict });
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

import { logCorrection, listRecentCorrections, clearCorrectionsForUser, isLoggableField } from './CorrectionsService';

describe('isLoggableField', () => {
  it('accepts free-text fields', () => {
    expect(isLoggableField('name')).toBe(true);
    expect(isLoggableField('telegram')).toBe(true);
    expect(isLoggableField('notes')).toBe(true);
  });
  it('rejects clear/control fields', () => {
    expect(isLoggableField('telegram-clear')).toBe(false);
    expect(isLoggableField('preferred')).toBe(false);
    expect(isLoggableField('phone-remove')).toBe(false);
  });
});

describe('logCorrection', () => {
  it('inserts a row when fields differ and field is loggable', async () => {
    await logCorrection({ userId: 'u-1', field: 'name', originalText: 'Sara', correctedText: 'Sarah Lee' });
    expect(insertValues).toHaveBeenCalledTimes(1);
    const args = insertValues.mock.calls[0][0];
    expect(args).toMatchObject({
      userId: 'u-1', field: 'name', originalText: 'Sara', correctedText: 'Sarah Lee',
    });
  });

  it('does NOT insert when original equals corrected', async () => {
    await logCorrection({ userId: 'u-1', field: 'name', originalText: 'Sarah', correctedText: 'Sarah' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('does NOT insert when either side is empty after trim', async () => {
    await logCorrection({ userId: 'u-1', field: 'name', originalText: '   ', correctedText: 'Sarah' });
    await logCorrection({ userId: 'u-1', field: 'name', originalText: 'Sara', correctedText: '' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('does NOT insert for non-loggable fields', async () => {
    await logCorrection({ userId: 'u-1', field: 'telegram-clear', originalText: 'a', correctedText: 'b' });
    await logCorrection({ userId: 'u-1', field: 'preferred', originalText: 'email', correctedText: 'phone' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('uses onConflict to bump used_count on duplicate triple', async () => {
    await logCorrection({ userId: 'u-1', field: 'name', originalText: 'Sara', correctedText: 'Sarah Lee' });
    expect(insertOnConflict).toHaveBeenCalledTimes(1);
    const conflictArgs = insertOnConflict.mock.calls[0][0];
    expect(conflictArgs).toHaveProperty('target');
    expect(conflictArgs).toHaveProperty('set');
  });

  it('trims whitespace on both sides before logging', async () => {
    await logCorrection({ userId: 'u-1', field: 'name', originalText: '  Sara  ', correctedText: '  Sarah Lee  ' });
    expect(insertValues).toHaveBeenCalledTimes(1);
    const args = insertValues.mock.calls[0][0];
    expect(args.originalText).toBe('Sara');
    expect(args.correctedText).toBe('Sarah Lee');
  });
});

describe('listRecentCorrections', () => {
  it('orders by created_at desc and limits', async () => {
    selectLimit.mockResolvedValueOnce([
      { id: 'c-1', userId: 'u-1', field: 'name', originalText: 'Sara', correctedText: 'Sarah' },
    ]);
    const out = await listRecentCorrections('u-1', 5);
    expect(out).toHaveLength(1);
    expect(selectLimit).toHaveBeenCalledWith(5);
  });

  it('defaults to a sensible cap', async () => {
    await listRecentCorrections('u-1');
    expect(selectLimit).toHaveBeenCalledWith(10);
  });
});

describe('clearCorrectionsForUser', () => {
  it('deletes all corrections for the user', async () => {
    await clearCorrectionsForUser('u-1');
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
