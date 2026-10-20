import { describe, expect, it } from 'vitest';
import { FILE_LIMITS, MAX_FILE_BYTES, sniff } from '../src/index.js';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const head = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? ascii(p) : p)));

describe('sniff', () => {
  it('knows each type by its first bytes', () => {
    const cases: [Uint8Array, string, string][] = [
      [head([0x89], 'PNG\r\n', [0x1a, 0x0a]), 'image', 'image/png'],
      [head([0xff, 0xd8, 0xff, 0xe0]), 'image', 'image/jpeg'],
      [head('RIFF', [1, 2, 3, 4], 'WEBPVP8 '), 'image', 'image/webp'],
      [head('ID3', [4, 0]), 'audio', 'audio/mpeg'],
      [head([0xff, 0xfb, 0x90, 0x64]), 'audio', 'audio/mpeg'],
      [head([0xff, 0xf3, 0x90, 0x64]), 'audio', 'audio/mpeg'],
      [head([0xff, 0xf1, 0x50, 0x80]), 'audio', 'audio/aac'],
      [head([0xff, 0xf9, 0x50, 0x80]), 'audio', 'audio/aac'],
      [head([0, 0, 0, 0x20], 'ftypM4A ', [0, 0]), 'audio', 'audio/mp4'],
      [head([0, 0, 0, 0x20], 'ftypM4B '), 'audio', 'audio/mp4'],
      [head([0, 0, 0, 0x1c], 'ftypmp42'), 'audio', 'audio/mp4'],
      [head([0, 0, 0, 0x1c], 'ftypisom'), 'audio', 'audio/mp4'],
      [head('RIFF', [1, 2, 3, 4], 'WAVEfmt '), 'audio', 'audio/wav'],
      [head('OggS', [0]), 'audio', 'audio/ogg'],
      [head('fLaC', [0]), 'audio', 'audio/flac'],
    ];
    for (const [bytes, kind, mime] of cases) expect(sniff(bytes), mime).toEqual({ kind, mime });
  });

  it('refuses everything else', () => {
    for (const bytes of [
      head('%PDF-1.7'),
      head('GIF89a'),
      head('<svg xmlns'),
      head([0x50, 0x4b, 0x03, 0x04]),
      head('RIFF', [1, 2, 3, 4], 'AVI '),
      head([0, 0, 0, 0x20], 'ftypqt  '),
      // MPEG layer I, not III.
      head([0xff, 0xff]),
      head([0x89, 0x50]),
      head(),
    ]) {
      expect(sniff(bytes)).toBeNull();
    }
  });

  it('has the limits of the design', () => {
    expect(FILE_LIMITS).toEqual({ image: 40 * 1024 * 1024, audio: 80 * 1024 * 1024 });
    expect(MAX_FILE_BYTES).toBe(80 * 1024 * 1024);
  });
});
