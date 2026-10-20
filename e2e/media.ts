import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

// Small real files for the board (asset-board design decision 18): PNGs the
// browser decodes and WAVs it plays, named as Midjourney and Suno name their
// downloads. Each call gives other bytes, so other hashes.

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

let shade = 0;

// A 16:9 picture in one colour, a band of another across it; `portrait()`
// for a PC's or an NPC's 2:3.
export function png(width = 160, height = 90): Buffer {
  shade += 1;
  const [r, g, b] = [(shade * 53) % 256, (shade * 97) % 256, (shade * 151) % 256];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const band = y > height / 3 && y < (2 * height) / 3;
      row[1 + x * 3] = band ? 255 - r : r;
      row[2 + x * 3] = band ? 255 - g : g;
      row[3 + x * 3] = band ? 255 - b : b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const portrait = () => png(120, 180);

let tone = 0;

// A mono 16-bit tone of `seconds`, a little higher each call.
export function wav(seconds = 1): Buffer {
  tone += 1;
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * (220 + tone * 20) * i) / rate)), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// Midjourney's download name: the user, the prompt's first words in lower
// case joined by underscores and cut, the job's id, the image's number. The
// same for a prompt of any category; two prompts that start with the same
// words give a name that matches both.
export function midjourneyName(prompt: string, n: number, { user = 'e2e', job = randomUUID(), words = 7 } = {}): string {
  const first = prompt
    .replace(/--\S+(\s+\S+)?/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, words);
  return `${user}_${first.join('_')}_${job}_${n}.png`;
}

// Suno's: the track's title, then « (1)» for a second take.
export const sunoName = (title: string, take = 0, ext = 'wav') => `${title}${take ? ` (${take})` : ''}.${ext}`;
