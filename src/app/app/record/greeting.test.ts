import { describe, it, expect } from 'vitest';
import { getFirstName } from './greeting';

describe('getFirstName', () => {
  it('returns the first whitespace-separated word', () => {
    expect(getFirstName('Tim Nan')).toBe('Tim');
  });

  it('trims surrounding whitespace', () => {
    expect(getFirstName('   Tim  ')).toBe('Tim');
  });

  it('returns the whole string if there is only one word', () => {
    expect(getFirstName('Tim')).toBe('Tim');
  });

  it('returns null for empty string', () => {
    expect(getFirstName('')).toBe(null);
  });

  it('returns null for whitespace-only', () => {
    expect(getFirstName('   ')).toBe(null);
  });

  it('returns null for null input', () => {
    expect(getFirstName(null)).toBe(null);
  });
});
