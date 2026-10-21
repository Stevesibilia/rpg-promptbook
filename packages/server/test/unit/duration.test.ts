import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { trackDuration } from '../../src/files/duration.js';
import { wav } from '../wav.js';

// Bytes, not objects, in two chunks, as a file's stream gives them.
const stream = (bytes: Buffer) => Readable.from([bytes.subarray(0, 100), bytes.subarray(100)], { objectMode: false });

describe('trackDuration', () => {
  it('reads a WAV’s length from its bytes', async () => {
    const bytes = wav(8000 * 2.5);
    expect(await trackDuration(stream(bytes), 'audio/wav', bytes.length)).toBe(2.5);
  });

  it('answers null for bytes that give no length, and closes the stream', async () => {
    for (const [bytes, mime] of [
      [Buffer.alloc(8000), 'audio/mpeg'],
      [Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'), Buffer.alloc(8000)]), 'audio/mpeg'],
      [Buffer.from('not audio at all'), 'audio/ogg'],
      [Buffer.alloc(0), 'audio/wav'],
      [wav(0), 'audio/wav'],
    ] as const) {
      const input = stream(bytes);
      expect(await trackDuration(input, mime, bytes.length)).toBeNull();
      expect(input.destroyed).toBe(true);
    }
  });

  it('answers null when the stream fails', async () => {
    const input = new Readable({
      read() {
        this.destroy(new Error('disk gone'));
      },
    });
    expect(await trackDuration(input, 'audio/mpeg', 1000)).toBeNull();
  });
});
