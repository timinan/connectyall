import { describe, it, expect, vi, beforeEach } from 'vitest';

const onConflictDoUpdateMock = vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ telegramUserId: 1, displayName: 'Tim' }]) });
const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
const limitMock = vi.fn().mockResolvedValue([{ telegramUserId: 1, displayName: 'Tim' }]);
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });
const updateMock = vi.fn().mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, select: selectMock, update: updateMock }),
}));

vi.mock('../lib/r2/client', () => ({
  uploadPhoto: vi.fn().mockResolvedValue('https://pub-test.r2.dev/profiles/1.jpg'),
}));

import { getProfile, upsertProfile, setPhotoFromTelegram } from './UserProfileService';

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

  it('setPhotoFromTelegram downloads, uploads to R2, persists URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/file.jpg' } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer));

    const url = await setPhotoFromTelegram(1, 'AgAC...');
    expect(url).toBe('https://pub-test.r2.dev/profiles/1.jpg');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
