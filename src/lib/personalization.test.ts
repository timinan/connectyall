import { describe, it, expect } from 'vitest';
import {
  normalizeVocabulary,
  buildWhisperInitialPrompt,
  buildExtractionPersonalizationBlock,
} from './personalization';

describe('normalizeVocabulary', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeVocabulary(null)).toBeNull();
    expect(normalizeVocabulary(undefined)).toBeNull();
    expect(normalizeVocabulary('')).toBeNull();
    expect(normalizeVocabulary('   ')).toBeNull();
  });

  it('trims and collapses internal whitespace', () => {
    expect(normalizeVocabulary('  Sarah   Lee,   V  ')).toBe('Sarah Lee, V');
  });

  it('caps at 500 characters', () => {
    const long = 'a'.repeat(600);
    const out = normalizeVocabulary(long);
    expect(out!.length).toBe(500);
  });

  it('preserves comma-separated structure', () => {
    expect(normalizeVocabulary('Sarah Lee, V (the founder), Pinto Money'))
      .toBe('Sarah Lee, V (the founder), Pinto Money');
  });
});

describe('buildWhisperInitialPrompt', () => {
  it('returns undefined when vocabulary is null', () => {
    expect(buildWhisperInitialPrompt(null)).toBeUndefined();
  });

  it('returns a sentence-shaped prompt when vocabulary is set', () => {
    const out = buildWhisperInitialPrompt('Sarah Lee, V, Pinto Money');
    expect(out).toContain('Sarah Lee');
    expect(out).toContain('Pinto Money');
    // OpenAI's Whisper docs recommend prompt look like natural speech context.
    expect(out!.length).toBeLessThanOrEqual(500);
  });
});

describe('buildExtractionPersonalizationBlock', () => {
  it('returns empty string when nothing is set', () => {
    expect(buildExtractionPersonalizationBlock({ vocabulary: null, corrections: [], examples: [] })).toBe('');
  });

  it('includes vocabulary section when vocabulary is set', () => {
    const out = buildExtractionPersonalizationBlock({
      vocabulary: 'Sarah Lee, V (the founder), Pinto Money',
      corrections: [],
      examples: [],
    });
    expect(out).toContain('USER VOCABULARY');
    expect(out).toContain('Sarah Lee');
  });

  it('includes corrections section when corrections are present', () => {
    const out = buildExtractionPersonalizationBlock({
      vocabulary: null,
      corrections: [
        { field: 'name', originalText: 'Sarra', correctedText: 'Sarah Lee' },
        { field: 'telegram', originalText: 'timman', correctedText: 'timnan' },
      ],
      examples: [],
    });
    expect(out).toContain('RECENT CORRECTIONS');
    expect(out).toContain('"Sarra"');
    expect(out).toContain('"Sarah Lee"');
    expect(out).toContain('"timman"');
    expect(out).toContain('"timnan"');
  });

  it('includes examples section when examples are present', () => {
    const out = buildExtractionPersonalizationBlock({
      vocabulary: null,
      corrections: [],
      examples: [
        {
          transcript: 'Met Sarah Lee at Notion, designer.',
          expectedJson: { name: 'Sarah Lee', company: 'Notion', role: 'Designer' },
        },
      ],
    });
    expect(out).toContain('USER EXAMPLES');
    expect(out).toContain('Sarah Lee');
    expect(out).toContain('"name"');
  });

  it('combines all three sections in stable order', () => {
    const out = buildExtractionPersonalizationBlock({
      vocabulary: 'V',
      corrections: [{ field: 'name', originalText: 'Sara', correctedText: 'Sarah' }],
      examples: [{ transcript: 't', expectedJson: { name: 'n' } }],
    });
    const vocabIdx = out.indexOf('USER VOCABULARY');
    const corrIdx = out.indexOf('RECENT CORRECTIONS');
    const exIdx = out.indexOf('USER EXAMPLES');
    expect(vocabIdx).toBeGreaterThan(-1);
    expect(corrIdx).toBeGreaterThan(vocabIdx);
    expect(exIdx).toBeGreaterThan(corrIdx);
  });

  it('caps examples at 3', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      transcript: `t${i}`,
      expectedJson: { name: `n${i}` },
    }));
    const out = buildExtractionPersonalizationBlock({
      vocabulary: null,
      corrections: [],
      examples: many,
    });
    expect(out).toContain('t0');
    expect(out).toContain('t1');
    expect(out).toContain('t2');
    expect(out).not.toContain('t3');
    expect(out).not.toContain('t4');
  });
});
