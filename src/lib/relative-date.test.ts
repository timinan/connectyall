import { describe, it, expect } from 'vitest';
import { relativeDate } from './relative-date';

describe('relativeDate', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it('returns "today" for same calendar day', () => {
    expect(relativeDate('2026-06-18T09:00:00Z', now)).toBe('today');
  });

  it('returns "yesterday" for previous calendar day', () => {
    expect(relativeDate('2026-06-17T23:00:00Z', now)).toBe('yesterday');
  });

  it('returns "N days ago" within the last week', () => {
    expect(relativeDate('2026-06-15T12:00:00Z', now)).toBe('3 days ago');
  });

  it('returns short date for older same-year', () => {
    expect(relativeDate('2026-02-12T12:00:00Z', now)).toBe('Feb 12');
  });

  it('returns date with year for different year', () => {
    expect(relativeDate('2024-12-01T12:00:00Z', now)).toBe('Dec 1, 2024');
  });
});
