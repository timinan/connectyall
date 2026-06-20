import { describe, it, expect } from 'vitest';
import { resolveRelativeDate } from './follow-up-dates';

const anchor = new Date('2026-06-20T16:00:00Z'); // Sat 9am Vancouver
const tz = 'America/Vancouver';

describe('resolveRelativeDate', () => {
  it('returns null for null input', () => {
    expect(resolveRelativeDate(null, anchor, tz)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveRelativeDate('', anchor, tz)).toBeNull();
  });

  it('parses "tomorrow"', () => {
    const result = resolveRelativeDate('tomorrow', anchor, tz);
    expect(result).not.toBeNull();
    // Tomorrow noon local in Vancouver = 19:00 UTC on Jun 21
    expect(result!.toISOString().startsWith('2026-06-21T19:00')).toBe(true);
  });

  it('parses "in 3 days"', () => {
    const result = resolveRelativeDate('in 3 days', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-23T19:00')).toBe(true);
  });

  it('parses "next week" as +7 days', () => {
    const result = resolveRelativeDate('next week', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-27T19:00')).toBe(true);
  });

  it('parses "in 2 weeks"', () => {
    const result = resolveRelativeDate('in 2 weeks', anchor, tz);
    expect(result!.toISOString().startsWith('2026-07-04T19:00')).toBe(true);
  });

  it('parses "by Friday" as the next Friday', () => {
    // anchor is Sat 2026-06-20, next Friday = 2026-06-26
    const result = resolveRelativeDate('by Friday', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-26T19:00')).toBe(true);
  });

  it('returns null for un-parseable phrases', () => {
    expect(resolveRelativeDate('eventually', anchor, tz)).toBeNull();
    expect(resolveRelativeDate('whenever', anchor, tz)).toBeNull();
  });

  it('handles case-insensitive input', () => {
    const result = resolveRelativeDate('TOMORROW', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-21T19:00')).toBe(true);
  });

  it('falls back to UTC when timezone is unknown', () => {
    const result = resolveRelativeDate('tomorrow', anchor, 'Not/A_Real_Zone');
    // Should still produce a date (noon UTC of next day)
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith('2026-06-21T12:00')).toBe(true);
  });
});
