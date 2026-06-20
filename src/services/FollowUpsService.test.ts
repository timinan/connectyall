import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.hoisted(() => vi.fn());
const insertReturning = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateReturning = vi.hoisted(() => vi.fn());
const deleteWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectOrderBy = vi.hoisted(() => vi.fn());
const selectInnerJoin = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/db/client', () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  insertReturning.mockResolvedValue([{ id: 'fu-1', topic: 'send the deck', dueAt: null, status: 'pending' }]);
  updateReturning.mockResolvedValue([{ id: 'fu-1', topic: 'send the deck (updated)', dueAt: null, status: 'pending' }]);
  insertValues.mockReturnValue({ returning: insertReturning });
  updateSet.mockReturnValue({ where: updateWhere });
  updateWhere.mockReturnValue({ returning: updateReturning });
  deleteWhere.mockResolvedValue(undefined);
  selectFrom.mockReturnValue({ where: selectWhere, innerJoin: selectInnerJoin });
  selectInnerJoin.mockReturnValue({ where: selectWhere });
  selectWhere.mockReturnValue({ orderBy: selectOrderBy });
  selectOrderBy.mockResolvedValue([]);
  dbMock.mockReturnValue({
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
    select: () => ({ from: selectFrom }),
  });
});

import {
  createFollowUp,
  createManyForInteraction,
  listForContact,
  updateFollowUp,
  deleteFollowUp,
  countDueTodayForUser,
  listDueTodayForUser,
} from './FollowUpsService';

describe('FollowUpsService', () => {
  it('createFollowUp inserts a row with the given fields', async () => {
    const result = await createFollowUp({
      userId: 'u-1',
      contactId: 'c-1',
      topic: 'send the deck',
      dueAt: null,
    });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      contactId: 'c-1',
      topic: 'send the deck',
      dueAt: null,
      status: 'pending',
    }));
    expect(result.id).toBe('fu-1');
  });

  it('createManyForInteraction deletes existing rows for the interaction first (idempotency)', async () => {
    await createManyForInteraction({
      userId: 'u-1',
      contactId: 'c-1',
      interactionId: 'i-1',
      followUps: [{ topic: 'send the deck', dueAt: null }],
    });
    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalled();
  });

  it('createManyForInteraction is a no-op when followUps array is empty', async () => {
    await createManyForInteraction({
      userId: 'u-1',
      contactId: 'c-1',
      interactionId: 'i-1',
      followUps: [],
    });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('listForContact selects with contact_id filter and orderBy', async () => {
    await listForContact('c-1');
    expect(selectFrom).toHaveBeenCalled();
    expect(selectWhere).toHaveBeenCalled();
    expect(selectOrderBy).toHaveBeenCalled();
  });

  it('updateFollowUp passes through topic, dueAt, status', async () => {
    const result = await updateFollowUp('fu-1', { topic: 'new topic', status: 'done' });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      topic: 'new topic',
      status: 'done',
    }));
    expect(result.id).toBe('fu-1');
  });

  it('updateFollowUp sets doneAt when status flips to done', async () => {
    await updateFollowUp('fu-1', { status: 'done' });
    const call = updateSet.mock.calls[0][0];
    expect(call.status).toBe('done');
    expect(call.doneAt).toBeInstanceOf(Date);
  });

  it('updateFollowUp clears doneAt when status flips back to pending', async () => {
    await updateFollowUp('fu-1', { status: 'pending' });
    const call = updateSet.mock.calls[0][0];
    expect(call.status).toBe('pending');
    expect(call.doneAt).toBeNull();
  });

  it('deleteFollowUp deletes by id', async () => {
    await deleteFollowUp('fu-1');
    expect(deleteWhere).toHaveBeenCalled();
  });
});

describe('FollowUpsService — due-today', () => {
  beforeEach(() => {
    // Override the selectOrderBy mock to also feed listDueTodayForUser tests
    selectOrderBy.mockResolvedValue([
      { id: 'fu-1', topic: 't1', contactName: 'Sarah', contactId: 'c-1' },
      { id: 'fu-2', topic: 't2', contactName: 'Marcus', contactId: 'c-2' },
    ]);
  });

  it('countDueTodayForUser runs a SELECT scoped to user + pending + due-by-end-of-today', async () => {
    selectOrderBy.mockResolvedValueOnce([{ id: 'fu-1' }, { id: 'fu-2' }]);
    const count = await countDueTodayForUser('u-1', 'America/Vancouver');
    expect(count).toBe(2);
    expect(selectFrom).toHaveBeenCalled();
  });

  it('listDueTodayForUser returns rows with contact info attached', async () => {
    const rows = await listDueTodayForUser('u-1', 'America/Vancouver');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveProperty('contactName');
  });
});
