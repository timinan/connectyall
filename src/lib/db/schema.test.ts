import { describe, it, expect } from 'vitest';
import { users, contacts, interactions, usageEvents } from './schema';

describe('schema', () => {
  it('defines all four tables', () => {
    expect(users).toBeDefined();
    expect(contacts).toBeDefined();
    expect(interactions).toBeDefined();
    expect(usageEvents).toBeDefined();
  });

  it('users table has required columns', () => {
    const cols = Object.keys(users);
    expect(cols).toEqual(
      expect.arrayContaining(['telegramUserId', 'displayName', 'socials', 'createdAt'])
    );
  });
});
