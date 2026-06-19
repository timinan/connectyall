import { describe, it, expect } from 'vitest';
import { buildShareMessage } from './share-message';

describe('buildShareMessage', () => {
  it('drops it into the chatting-about template with the share URL footer', () => {
    const out = buildShareMessage({
      contactName: 'Sarah Chen',
      recap: 'her startup pivot from B2B to consumer',
      shareUrl: 'https://connectyall.vercel.app/c/abc',
    });
    expect(out).toBe(
      'Hey Sarah, it was great meeting and chatting about her startup pivot from B2B to consumer with you!\n\nConnect with me: https://connectyall.vercel.app/c/abc'
    );
  });

  it('uses first name only', () => {
    const out = buildShareMessage({
      contactName: 'Sarah Chen Wong',
      recap: 'something',
      shareUrl: 'https://x/y',
    });
    expect(out.startsWith('Hey Sarah,')).toBe(true);
  });

  it('strips trailing period so it never doubles with the sentence !', () => {
    const out = buildShareMessage({
      contactName: 'Sam',
      recap: 'her PhD research on protein folding.',
      shareUrl: 'https://x/y',
    });
    expect(out).toContain('protein folding with you!');
    expect(out).not.toContain('folding. with you');
  });

  it('strips trailing exclamation or question marks too', () => {
    const out = buildShareMessage({
      contactName: 'Sam',
      recap: 'his AI startup launch!',
      shareUrl: 'https://x/y',
    });
    expect(out).toContain('launch with you!');
  });

  it('falls back to a plain greeting when no recap is available', () => {
    const out = buildShareMessage({
      contactName: 'Sam',
      recap: '',
      shareUrl: 'https://x/y',
    });
    expect(out).toBe('Hey Sam, it was great meeting you!\n\nConnect with me: https://x/y');
  });

  it('omits the footer when shareUrl is null', () => {
    const out = buildShareMessage({
      contactName: 'Sam',
      recap: 'his side project',
      shareUrl: null,
    });
    expect(out).toBe('Hey Sam, it was great meeting and chatting about his side project with you!');
    expect(out).not.toContain('Connect with me');
  });

  it('handles a single-name contact', () => {
    const out = buildShareMessage({
      contactName: 'Madonna',
      recap: 'her latest tour',
      shareUrl: 'https://x/y',
    });
    expect(out.startsWith('Hey Madonna,')).toBe(true);
  });

  it('falls back to "there" when contactName is empty', () => {
    const out = buildShareMessage({
      contactName: '',
      recap: 'something',
      shareUrl: 'https://x/y',
    });
    expect(out.startsWith('Hey there,')).toBe(true);
  });
});
