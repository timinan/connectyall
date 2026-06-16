import { describe, it, expect, vi, beforeEach } from 'vitest';

const onConflictDoUpdateMock = vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ telegramUserId: 1, displayName: 'Tim' }]) });
const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
const limitMock = vi.fn().mockResolvedValue([{ telegramUserId: 1, displayName: 'Tim' }]);
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });
const updateWhereMock = vi.fn().mockResolvedValue(undefined);
const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, select: selectMock, update: updateMock }),
}));

vi.mock('../lib/r2/client', () => ({
  uploadPhoto: vi.fn().mockResolvedValue('https://pub-test.r2.dev/profiles/1.jpg'),
}));

import { getProfile, upsertProfile, setSocial, getById, getByEmail } from './UserProfileService';

describe('UserProfileService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getProfile returns the user when found', async () => {
    const user = await getProfile(1);
    expect(user?.displayName).toBe('Tim');
  });

  it('getProfile returns null when empty', async () => {
    limitMock.mockResolvedValueOnce([]);
    const user = await getProfile(42);
    expect(user).toBeNull();
  });

  it('upsertProfile inserts and returns the row', async () => {
    const user = await upsertProfile({ telegramUserId: 1, displayName: 'Tim' });
    expect(user.displayName).toBe('Tim');
    expect(insertMock).toHaveBeenCalled();
  });

  it('setSocial calls update with atomic jsonb merge sql', async () => {
    await setSocial('user-uuid-1', 'x', 'timnan');
    expect(updateMock).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalled();
    // The set call receives a socials key containing a Drizzle sql template object (not a plain string)
    const setArg = updateSetMock.mock.calls[0][0];
    expect(setArg).toHaveProperty('socials');
    expect(typeof setArg.socials).toBe('object');
  });

  it('getById returns the user when found', async () => {
    limitMock.mockResolvedValueOnce([{ id: 'uuid-1', displayName: 'Tim' }]);
    const user = await getById('uuid-1');
    expect(user?.displayName).toBe('Tim');
  });

  it('getById returns null when empty', async () => {
    limitMock.mockResolvedValueOnce([]);
    const user = await getById('nonexistent');
    expect(user).toBeNull();
  });

  it('getByEmail returns the user when found', async () => {
    limitMock.mockResolvedValueOnce([{ id: 'uuid-1', email: 'tim@example.com' }]);
    const user = await getByEmail('tim@example.com');
    expect(user?.id).toBe('uuid-1');
  });
});
