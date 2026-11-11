// An image's width and height from its header (board-image-generation design
// decision 9), for the files the server makes itself: the server has no
// image library. PNG's IHDR, JPEG's SOFn and WebP's VP8, VP8L and VP8X
// headers. Null when the header is missing, truncated or says 0: the image
// still lands, without its size.

export interface Dimensions {
  width: number;
  height: number;
}

const sized = (width: number, height: number): Dimensions | null =>
  width > 0 && height > 0 ? { width, height } : null;

function png(b: Buffer): Dimensions | null {
  if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return sized(b.readUInt32BE(16), b.readUInt32BE(20));
}

// Start-of-frame markers: C0 to CF but C4 (Huffman tables), C8 (reserved)
// and CC (arithmetic coding).
const isSof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpeg(b: Buffer): Dimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    // Fill bytes before a marker.
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    if (i + 1 >= b.length) return null;
    const marker = b[i + 1]!;
    // Markers with no length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Start of scan or end of image before any frame header.
    if (marker === 0xda || marker === 0xd9) return null;
    if (i + 4 > b.length) return null;
    const length = b.readUInt16BE(i + 2);
    if (length < 2) return null;
    if (isSof(marker)) {
      if (i + 9 > b.length) return null;
      return sized(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
    }
    i += 2 + length;
  }
  return null;
}

function webp(b: Buffer): Dimensions | null {
  if (b.length < 16 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    // The frame tag, then the start code 9d 01 2a, then 14-bit sizes.
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') {
    if (b.length < 30) return null;
    return sized(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
  }
  return null;
}

export function imageDimensions(bytes: Buffer, mime: string): Dimensions | null {
  if (mime === 'image/png') return png(bytes);
  if (mime === 'image/jpeg') return jpeg(bytes);
  if (mime === 'image/webp') return webp(bytes);
  return null;
}
