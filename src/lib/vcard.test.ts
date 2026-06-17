import { describe, it, expect } from 'vitest';
import { buildVCard, buildContactVCard } from './vcard';

describe('buildVCard', () => {
  it('emits a valid vCard 3.0 string', () => {
    const v = buildVCard({
      displayName: 'Tim Nan',
      tagline: 'PM building crypto products',
      socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com', website: 'tim.dev' },
      telegramUsername: 'timnan',
    });
    expect(v).toContain('BEGIN:VCARD');
    expect(v).toContain('VERSION:3.0');
    expect(v).toContain('FN:Tim Nan');
    expect(v).toContain('TITLE:PM building crypto products');
    expect(v).toContain('EMAIL;TYPE=INTERNET:tim@example.com');
    expect(v).toContain('URL;TYPE=Website:https://tim.dev');
    expect(v).toContain('URL;TYPE=Twitter:https://x.com/timnan');
    expect(v).toContain('URL;TYPE=LinkedIn:https://linkedin.com/in/timnan');
    expect(v).toContain('URL;TYPE=Telegram:https://t.me/timnan');
    expect(v).toContain('END:VCARD');
  });

  it('omits unset socials', () => {
    const v = buildVCard({
      displayName: 'Tim Nan',
      tagline: null,
      socials: {},
      telegramUsername: null,
    });
    expect(v).not.toContain('EMAIL');
    expect(v).not.toContain('URL');
    expect(v).not.toContain('TITLE');
  });
});

describe('N: field name splitting', () => {
  it('splits two-part name into given + family', () => {
    const v = buildVCard({
      displayName: 'John Smith',
      tagline: null,
      socials: {},
      telegramUsername: null,
    });
    expect(v).toContain('N:Smith;John;;;');
  });

  it('handles multi-word given name (Mei Ling Chen)', () => {
    const v = buildContactVCard({
      name: 'Mei Ling Chen',
      emails: [],
      phones: [],
      telegram: null,
      x: null,
      linkedin: null,
      website: null,
    });
    expect(v).toContain('N:Chen;Mei Ling;;;');
  });

  it('handles single-word name (mononym)', () => {
    const v = buildContactVCard({
      name: 'Cher',
      emails: [],
      phones: [],
      telegram: null,
      x: null,
      linkedin: null,
      website: null,
    });
    expect(v).toContain('N:;Cher;;;');
  });

  it('handles empty string without crashing', () => {
    const v = buildVCard({
      displayName: '',
      tagline: null,
      socials: {},
      telegramUsername: null,
    });
    expect(v).toContain('BEGIN:VCARD');
    expect(v).toContain('END:VCARD');
    expect(v).toContain('N:;;;');
  });
});
