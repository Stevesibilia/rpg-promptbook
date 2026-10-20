import type { FileKind } from './board.js';

// A file's type from its first bytes, never from its name or a header
// (asset-board design decision 3). Shared by the server's upload route and
// the desktop app's intake.

// Enough of the head for every type below.
export const SNIFF_BYTES = 12;

// The largest file of each kind, in bytes.
export const FILE_LIMITS: Record<FileKind, number> = {
  image: 40 * 1024 * 1024,
  audio: 80 * 1024 * 1024,
};

export const MAX_FILE_BYTES = Math.max(...Object.values(FILE_LIMITS));

export interface Sniffed {
  kind: FileKind;
  mime: string;
}

const ascii = (head: Uint8Array, at: number, text: string): boolean =>
  head.length >= at + text.length && [...text].every((c, i) => head[at + i] === c.charCodeAt(0));

const bytes = (head: Uint8Array, at: number, values: number[]): boolean =>
  head.length >= at + values.length && values.every((v, i) => head[at + i] === v);

const M4A_BRANDS = ['M4A ', 'M4B ', 'mp42', 'isom'];

export function sniff(head: Uint8Array): Sniffed | null {
  if (bytes(head, 0, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'image', mime: 'image/png' };
  if (bytes(head, 0, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg' };
  if (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP')) return { kind: 'image', mime: 'image/webp' };
  if (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WAVE')) return { kind: 'audio', mime: 'audio/wav' };
  if (ascii(head, 0, 'ID3')) return { kind: 'audio', mime: 'audio/mpeg' };
  if (head.length >= 2 && head[0] === 0xff) {
    const second = head[1]!;
    // An MPEG frame sync: eleven set bits, then the version and the layer;
    // layer III is 01.
    if ((second & 0xe0) === 0xe0 && ((second >> 1) & 0x03) === 0x01) return { kind: 'audio', mime: 'audio/mpeg' };
    // An AAC ADTS header, MPEG-4 or MPEG-2, without a CRC.
    if (second === 0xf1 || second === 0xf9) return { kind: 'audio', mime: 'audio/aac' };
  }
  if (ascii(head, 4, 'ftyp') && M4A_BRANDS.some((brand) => ascii(head, 8, brand))) {
    return { kind: 'audio', mime: 'audio/mp4' };
  }
  if (ascii(head, 0, 'OggS')) return { kind: 'audio', mime: 'audio/ogg' };
  if (ascii(head, 0, 'fLaC')) return { kind: 'audio', mime: 'audio/flac' };
  return null;
}
