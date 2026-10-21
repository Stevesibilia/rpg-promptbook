import type { Readable } from 'node:stream';
import { parseStream } from 'music-metadata';

// A track's length in seconds read from its bytes (cuebard-export design
// decision 10), for a track the board recorded none for. Null when the
// reader fails or finds no length above 0; the stream is closed either way,
// read to its end or not.
export async function trackDuration(stream: Readable, mime: string, size: number): Promise<number | null> {
  try {
    const { format } = await parseStream(stream, { mimeType: mime, size }, { duration: true, skipCovers: true });
    const seconds = format.duration;
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  } finally {
    stream.destroy();
  }
}
