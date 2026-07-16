import { describe, test, expect } from 'vitest';
import { sniffAudioMime } from './audio-sniff';

describe('sniffAudioMime', () => {
  test('sniffs webm/EBML', () => expect(sniffAudioMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/webm'));
  test('sniffs mp4/ftyp', () => expect(sniffAudioMime(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe('audio/mp4'));
  test('sniffs ogg', () => expect(sniffAudioMime(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/ogg'));
  test('sniffs mp3 via ID3 and frame sync', () => {
    expect(sniffAudioMime(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/mpeg');
    expect(sniffAudioMime(new Uint8Array([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/mpeg');
  });
  test('sniffs wav/RIFF', () => expect(sniffAudioMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBe('audio/wav'));
  test('rejects non-audio', () => {
    expect(sniffAudioMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // png
    expect(sniffAudioMime(new Uint8Array([1, 2]))).toBeNull(); // too short
  });
});
