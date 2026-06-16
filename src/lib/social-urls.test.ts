import { describe, it, expect } from 'vitest';
import { linkedinHandle, linkedinUrl, xHandle, xUrl, telegramHandle, telegramUrl, websiteUrl } from './social-urls';

describe('linkedinHandle', () => {
  it.each([
    ['timnan', 'timnan'],
    ['in/timnan', 'timnan'],
    ['linkedin.com/in/timnan', 'timnan'],
    ['www.linkedin.com/in/timnan', 'timnan'],
    ['https://linkedin.com/in/timnan', 'timnan'],
    ['https://www.linkedin.com/in/timnan/', 'timnan'],
    ['linkedin.com/company/foo', 'foo'],
    ['@timnan', 'timnan'],
  ])('%s → %s', (input, expected) => {
    expect(linkedinHandle(input)).toBe(expected);
  });
});

describe('linkedinUrl', () => {
  it('produces a working URL regardless of input form', () => {
    expect(linkedinUrl('timnan')).toBe('https://linkedin.com/in/timnan');
    expect(linkedinUrl('https://www.linkedin.com/in/timnan/')).toBe('https://linkedin.com/in/timnan');
  });
});

describe('xHandle / xUrl', () => {
  it.each([
    ['timnan', 'timnan'],
    ['@timnan', 'timnan'],
    ['x.com/timnan', 'timnan'],
    ['twitter.com/timnan', 'timnan'],
    ['https://x.com/timnan/', 'timnan'],
  ])('xHandle %s → %s', (input, expected) => {
    expect(xHandle(input)).toBe(expected);
  });
  it('xUrl always renders as x.com', () => {
    expect(xUrl('twitter.com/timnan')).toBe('https://x.com/timnan');
  });
});

describe('telegramHandle / telegramUrl', () => {
  it.each([
    ['timnan', 'timnan'],
    ['@timnan', 'timnan'],
    ['t.me/timnan', 'timnan'],
    ['https://t.me/timnan', 'timnan'],
  ])('telegramHandle %s → %s', (input, expected) => {
    expect(telegramHandle(input)).toBe(expected);
  });
  it('telegramUrl always renders as t.me', () => {
    expect(telegramUrl('@timnan')).toBe('https://t.me/timnan');
  });
});

describe('websiteUrl', () => {
  it('prepends https when missing', () => {
    expect(websiteUrl('tim.dev')).toBe('https://tim.dev');
    expect(websiteUrl('http://tim.dev')).toBe('http://tim.dev');
    expect(websiteUrl('https://tim.dev/')).toBe('https://tim.dev');
  });
});
