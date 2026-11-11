import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/files/dimensions.js';
import { jpeg, png } from '../db/fake-openrouter.js';

// A segment: marker, then a length that counts itself.
const segment = (marker: number, body: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};

const riff = (chunk: string, body: Buffer) => {
  const head = Buffer.alloc(20);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(12 + body.length, 4);
  head.write('WEBP', 8, 'latin1');
  head.write(chunk, 12, 'latin1');
  head.writeUInt32LE(body.length, 16);
  return Buffer.concat([head, body]);
};

function vp8(width: number, height: number): Buffer {
  const body = Buffer.alloc(10);
  body.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]);
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  return riff('VP8 ', body);
}

function vp8l(width: number, height: number): Buffer {
  const body = Buffer.alloc(5);
  body[0] = 0x2f;
  body.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
  return riff('VP8L', body);
}

function vp8x(width: number, height: number): Buffer {
  const body = Buffer.alloc(10);
  body.writeUIntLE(width - 1, 4, 3);
  body.writeUIntLE(height - 1, 7, 3);
  return riff('VP8X', body);
}

describe('imageDimensions (board-image-generation D9)', () => {
  it('reads a PNG’s IHDR', () => {
    expect(imageDimensions(png(160, 90, 1), 'image/png')).toEqual({ width: 160, height: 90 });
  });

  it('reads a JPEG’s SOF0 past its APP0 and comment segments', () => {
    for (const [shape, size] of [
      ['16:9', { width: 160, height: 90 }],
      ['2:3', { width: 100, height: 150 }],
    ] as const) {
      expect(imageDimensions(jpeg(shape, 1), 'image/jpeg')).toEqual(size);
    }
  });

  it('reads past an APP1 segment before SOF0', () => {
    const base = jpeg('3:2', 2);
    const exif = segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.alloc(300, 0xc0)]));
    const withExif = Buffer.concat([base.subarray(0, 2), exif, base.subarray(2)]);
    expect(imageDimensions(withExif, 'image/jpeg')).toEqual({ width: 150, height: 100 });
  });

  it('reads a progressive SOF2, and skips fill bytes', () => {
    const sof2 = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe0, Buffer.alloc(14)),
      Buffer.from([0xff, 0xff]),
      segment(0xc2, Buffer.from([8, 0x03, 0x00, 0x05, 0x00, 1, 0x11, 0])),
    ]);
    expect(imageDimensions(sof2, 'image/jpeg')).toEqual({ width: 1280, height: 768 });
  });

  it('never takes DHT, JPG or DAC for a frame header', () => {
    const tables = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xc4, Buffer.from([8, 0x00, 0x10, 0x00, 0x10])),
      segment(0xcc, Buffer.from([8, 0x00, 0x10, 0x00, 0x10])),
      segment(0xc0, Buffer.from([8, 0x00, 0x20, 0x00, 0x40, 3])),
    ]);
    expect(imageDimensions(tables, 'image/jpeg')).toEqual({ width: 64, height: 32 });
  });

  it('reads WebP VP8, VP8L and VP8X', () => {
    expect(imageDimensions(vp8(1376, 768), 'image/webp')).toEqual({ width: 1376, height: 768 });
    expect(imageDimensions(vp8l(1536, 864), 'image/webp')).toEqual({ width: 1536, height: 864 });
    expect(imageDimensions(vp8x(4096, 2304), 'image/webp')).toEqual({ width: 4096, height: 2304 });
  });

  it('gives null for truncated bytes, a scan before any frame, or another type', () => {
    expect(imageDimensions(png(160, 90, 3).subarray(0, 20), 'image/png')).toBeNull();
    const full = jpeg('1:1', 3);
    const sof = full.indexOf(Buffer.from([0xff, 0xc0]));
    expect(imageDimensions(full.subarray(0, sof + 6), 'image/jpeg')).toBeNull();
    expect(imageDimensions(Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xda, Buffer.alloc(4))]), 'image/jpeg')).toBeNull();
    expect(imageDimensions(vp8(10, 10).subarray(0, 27), 'image/webp')).toBeNull();
    expect(imageDimensions(vp8l(10, 10).subarray(0, 22), 'image/webp')).toBeNull();
    expect(imageDimensions(vp8x(10, 10).subarray(0, 28), 'image/webp')).toBeNull();
    expect(imageDimensions(Buffer.alloc(0), 'image/png')).toBeNull();
    expect(imageDimensions(png(160, 90, 4), 'image/gif')).toBeNull();
  });
});
