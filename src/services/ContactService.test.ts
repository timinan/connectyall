import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertReturning = vi.fn().mockResolvedValue([{ id: 'uuid-1', name: 'Sarah' }]);
const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
const insertMock = vi.fn().mockReturnValue({ values: insertValues });

const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
const updateMock = vi.fn().mockReturnValue({ set: updateSet });

const selectLimit = vi.fn();
const selectWhere = vi.fn().mockReturnValue({
  limit: selectLimit,
  orderBy: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
  }),
});
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const selectMock = vi.fn().mockReturnValue({ from: selectFrom });

vi.mock('../lib/db/client', () => ({
  db: () => ({ insert: insertMock, update: updateMock, select: selectMock }),
}));

import { createContact, addInteraction, findByNameAndCompany } from './ContactService';

describe('ContactService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createContact returns the inserted row', async () => {
    const contact = await createContact({ userId: 1, name: 'Sarah', role: 'PM', company: 'Acme', emails: [], links: {} });
    expect(contact.name).toBe('Sarah');
    expect(insertMock).toHaveBeenCalled();
  });

  it('addInteraction inserts an interaction row and bumps last_touched_at', async () => {
    await addInteraction('uuid-1', 'voice', { recap: 'we talked' });
    expect(insertMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });

  it('findByNameAndCompany returns first match (case-insensitive)', async () => {
    selectLimit.mockResolvedValueOnce([{ id: 'uuid-1', name: 'Sarah Chen', company: 'Acme' }]);
    const found = await findByNameAndCompany(1, 'sarah chen', 'acme');
    expect(found?.id).toBe('uuid-1');
  });

  it('findByNameAndCompany returns null when none', async () => {
    selectLimit.mockResolvedValueOnce([]);
    const found = await findByNameAndCompany(1, 'unknown', null);
    expect(found).toBeNull();
  });
});
