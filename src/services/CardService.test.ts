import { describe, it, expect } from 'vitest';
import { buildCaption } from './CardService';

describe('buildCaption', () => {
  it('includes recap and all set socials', () => {
    const caption = buildCaption({
      profile: {
        displayName: 'Tim Nan',
        tagline: 'PM building crypto products',
        telegramUsername: 'timnan',
        socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com', website: 'tim.dev' },
      },
      contactName: 'Sarah',
      recap: 'we talked about USDC replacing bank rails',
    });

    expect(caption).toContain('Hey Sarah');
    expect(caption).toContain('USDC replacing bank rails');
    expect(caption).toContain('t.me/timnan');
    expect(caption).toContain('x.com/timnan');
    expect(caption).toContain('in/timnan');
    expect(caption).toContain('tim@example.com');
    expect(caption).toContain('tim.dev');
  });

  it('omits socials that are not set', () => {
    const caption = buildCaption({
      profile: { displayName: 'Tim Nan', tagline: null, telegramUsername: 'timnan', socials: {} },
      contactName: 'Sarah',
      recap: 'short recap',
    });
    expect(caption).toContain('t.me/timnan');
    expect(caption).not.toContain('x.com');
    expect(caption).not.toContain('linkedin');
  });

  it('truncates recap when caption would exceed 1024 chars', () => {
    const longRecap = 'we talked '.repeat(200);
    const caption = buildCaption({
      profile: {
        displayName: 'Tim', tagline: null, telegramUsername: 'timnan',
        socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com' },
      },
      contactName: 'Sarah',
      recap: longRecap,
    });
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain('t.me/timnan');
    expect(caption).toContain('x.com/timnan');
    expect(caption).toContain('tim@example.com');
  });
});
