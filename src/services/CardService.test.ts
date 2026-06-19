import { describe, it, expect } from 'vitest';
import { buildCaption } from './CardService';

describe('buildCaption', () => {
  it('uses the chatting-about template with the public share URL footer', () => {
    const caption = buildCaption({
      contactName: 'Sarah',
      recap: 'her startup pivot from B2B to consumer',
      shareUrl: 'https://connectyall.vercel.app/c/abc',
    });
    expect(caption).toContain('Hey Sarah, it was great meeting and chatting about her startup pivot from B2B to consumer with you!');
    expect(caption).toContain('Connect with me: https://connectyall.vercel.app/c/abc');
  });

  it('strips trailing punctuation from the recap so it lands cleanly in the sentence', () => {
    const caption = buildCaption({
      contactName: 'Sarah',
      recap: 'her PhD research on protein folding.',
      shareUrl: 'https://x/y',
    });
    expect(caption).toContain('protein folding with you!');
    expect(caption).not.toContain('folding. with you');
  });

  it('falls back to a plain greeting when there is no recap', () => {
    const caption = buildCaption({
      contactName: 'Sarah',
      recap: '',
      shareUrl: 'https://x/y',
    });
    expect(caption).toContain('Hey Sarah, it was great meeting you!');
  });

  it('truncates the recap when the message would exceed 1024 chars', () => {
    const longRecap = 'a really long topic '.repeat(80);
    const caption = buildCaption({
      contactName: 'Sarah',
      recap: longRecap,
      shareUrl: 'https://connectyall.vercel.app/c/abc',
    });
    expect(caption.length).toBeLessThanOrEqual(1024);
    // Footer is still intact after truncation
    expect(caption).toContain('Connect with me: https://connectyall.vercel.app/c/abc');
    // Recap got the elision marker (unicode ellipsis, not three periods)
    expect(caption).toContain('…');
  });
});
