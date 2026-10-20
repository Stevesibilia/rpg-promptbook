import type { FileKind } from 'promptbook-project';
import type { Probed } from './intake.js';

// A file's measures, read in the page (asset-board design decision 9): an
// image's size and a thumbnail 480 px wide, a track's duration. A file the
// browser cannot read is still added, without them: checks never block.

const THUMB_WIDTH = 480;
const DURATION_TIMEOUT_MS = 5000;

async function thumbnail(blob: Blob, width: number, height: number): Promise<Probed['thumb']> {
  const scaled = await createImageBitmap(blob, { resizeWidth: THUMB_WIDTH, resizeQuality: 'high' });
  try {
    const canvas = new OffscreenCanvas(THUMB_WIDTH, Math.max(1, Math.round((height * THUMB_WIDTH) / width)));
    canvas.getContext('2d')!.drawImage(scaled, 0, 0, canvas.width, canvas.height);
    // WebKit answers PNG when asked for WebP: then JPEG.
    let out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    if (out.type !== 'image/webp') out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return { bytes: new Uint8Array(await out.arrayBuffer()), mime: out.type };
  } finally {
    scaled.close();
  }
}

async function image(blob: Blob): Promise<Probed> {
  let width: number;
  let height: number;
  try {
    const full = await createImageBitmap(blob);
    width = full.width;
    height = full.height;
    full.close();
  } catch {
    return { width: null, height: null, duration: null, thumb: null };
  }
  let thumb: Probed['thumb'] = null;
  try {
    thumb = await thumbnail(blob, width, height);
  } catch {
    // No OffscreenCanvas, or a decoder that gave up: the tile loads the
    // original instead.
  }
  return { width, height, duration: null, thumb };
}

// An Audio element on an object URL, let go however it ends.
function audioDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (value: number | null) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    timer = setTimeout(() => done(null), DURATION_TIMEOUT_MS);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

export async function probe(blob: Blob, kind: FileKind): Promise<Probed> {
  if (kind === 'image') return image(blob);
  return { width: null, height: null, duration: await audioDuration(blob), thumb: null };
}
