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

import { getProfile, upsertProfile, setPhotoFromTelegram, setSocial } from './UserProfileService';

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
    await setSocial(1, 'x', 'timnan');
    expect(updateMock).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalled();
    // The set call receives a socials key containing a Drizzle sql template object (not a plain string)
    const setArg = updateSetMock.mock.calls[0][0];
    expect(setArg).toHaveProperty('socials');
    expect(typeof setArg.socials).toBe('object');
  });

  it('setPhotoFromTelegram downloads, uploads to R2, persists URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/file.jpg' } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer));

    const url = await setPhotoFromTelegram(1, 'AgAC...');
    expect(url).toBe('https://pub-test.r2.dev/profiles/1.jpg');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
