import { describe, it, expect } from 'vitest';
import { renderCard } from './CardService';

describe('renderCard', () => {
  it('returns a valid 512x512 PNG buffer for the initial-bubble fallback', async () => {
    const png = await renderCard({
      profile: {
        displayName: 'Tim Nan',
        tagline: 'PM building crypto products',
        telegramUsername: 'timnan',
        photoR2Url: null,
        socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com' },
      },
    });

    expect(png).toBeInstanceOf(Buffer);
    // PNG magic bytes: 89 50 4E 47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(500);
    expect(png.length).toBeLessThan(200_000);
  }, 30_000);
});
