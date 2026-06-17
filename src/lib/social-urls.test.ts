import { describe, it, expect } from 'vitest';
import { linkedinHandle, linkedinUrl, xHandle, xUrl, telegramHandle, telegramUrl, websiteUrl, whatsappHandle, whatsappUrl, wechatHandle, wechatUrl, lineHandle, lineUrl } from './social-urls';

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

describe('whatsappHandle / whatsappUrl', () => {
  it.each([
    ['14155551234', '14155551234'],
    ['+1 415 555 1234', '14155551234'],
    ['(415) 555-1234', '4155551234'],
    ['5551234', '5551234'],
  ])('whatsappHandle %s → %s', (input, expected) => {
    expect(whatsappHandle(input)).toBe(expected);
  });
  it('whatsappUrl produces wa.me URL', () => {
    expect(whatsappUrl('+1 415 555 1234')).toBe('https://wa.me/14155551234');
  });
  it('whatsappUrl appends digits-only', () => {
    expect(whatsappUrl('(555) 000-9999')).toBe('https://wa.me/5550009999');
  });
});

describe('wechatHandle / wechatUrl', () => {
  it.each([
    ['sarah_chen_88', 'sarah_chen_88'],
    ['@sarah_chen_88', 'sarah_chen_88'],
    ['https://wx.qq.com/sarah_chen_88', 'sarah_chen_88'],
    ['sarah88', 'sarah88'],
  ])('wechatHandle %s → %s', (input, expected) => {
    expect(wechatHandle(input)).toBe(expected);
  });
  it('wechatUrl produces weixin:// deep link', () => {
    expect(wechatUrl('sarah_chen_88')).toBe('weixin://dl/chat?sarah_chen_88');
  });
});

describe('lineHandle / lineUrl', () => {
  it.each([
    ['timmy', 'timmy'],
    ['@timmy', 'timmy'],
    ['~timmy', 'timmy'],
    ['https://line.me/ti/p/~timmy', 'timmy'],
    ['https://line.me/ti/p/timmy_jp', 'timmy_jp'],
    ['timmy_jp', 'timmy_jp'],
  ])('lineHandle %s → %s', (input, expected) => {
    expect(lineHandle(input)).toBe(expected);
  });
  it('lineUrl produces line.me URL with ~ prefix', () => {
    expect(lineUrl('timmy')).toBe('https://line.me/ti/p/~timmy');
    expect(lineUrl('https://line.me/ti/p/~timmy')).toBe('https://line.me/ti/p/~timmy');
  });
});
