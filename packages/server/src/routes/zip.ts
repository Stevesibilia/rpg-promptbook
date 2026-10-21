import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

// The streamed zips of the Markdown export and the CueBard pack.

// What a zip without ZIP64 can hold, with room for the text files and headers.
export const ZIP_BYTES_MAX = 4_000_000_000;
export const ZIP_ENTRIES_MAX = 65_000;

// A download name for Content-Disposition: an ASCII fallback and the UTF-8
// original.
export function attachment(reply: FastifyReply, name: string): FastifyReply {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return reply
    .type('application/zip')
    .header('content-disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
}

// The first chunk is read before the answer is committed, so a failure in
// the first reads is a 500 and not an empty 200.
export async function send(reply: FastifyReply, name: string, chunks: AsyncGenerator<Uint8Array>) {
  const first = await chunks.next();
  async function* all() {
    if (!first.done) yield first.value;
    yield* chunks;
  }
  return attachment(reply, name).send(Readable.from(all(), { objectMode: false }));
}

// fflate's Zip with its output queued: text entries deflated, media stored
// as they are (already compressed), each media chunk handed on as soon as it
// is written. The caller yields what flush gives after each step and calls
// terminate when it is done or fails.
export function zipWriter() {
  const queue: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else queue.push(chunk);
  });
  const flush = (): Uint8Array[] => {
    if (failure) throw failure;
    return queue.splice(0);
  };
  return {
    flush,
    text(path: string, content: string): void {
      const entry = new ZipDeflate(path, { level: 6 });
      zip.add(entry);
      entry.push(strToU8(content), true);
    },
    async *stored(path: string, stream: AsyncIterable<unknown>): AsyncGenerator<Uint8Array> {
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      for await (const chunk of stream) {
        entry.push(chunk as Uint8Array, false);
        yield* flush();
      }
      entry.push(new Uint8Array(0), true);
      yield* flush();
    },
    end(): Uint8Array[] {
      zip.end();
      return flush();
    },
    terminate(): void {
      zip.terminate();
    },
  };
}
