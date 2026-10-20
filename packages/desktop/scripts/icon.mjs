// Draws build/icon.png, the app's 1024×1024 icon (design decision 15): the
// web client's "P" logo, Emerald on a rounded square, with the margin macOS
// icons keep. electron-builder makes the .icns and .ico from it. Run with
// `node scripts/icon.mjs` after changing the drawing; the PNG is committed.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
// Samples per pixel side, for smooth edges.
const AA = 4;
const BACKGROUND = [0x1f, 0xb9, 0x8a]; // --primary
const INK = [0x08, 0x15, 0x0f]; // --on-primary

// The rounded square: 824 wide, 100 from each edge, as macOS draws icons.
const SQ = { x: 100, y: 100, size: 824, radius: 185 };

function inSquare(x, y) {
  const { x: sx, y: sy, size, radius } = SQ;
  if (x < sx || y < sy || x > sx + size || y > sy + size) return false;
  const cx = Math.min(Math.max(x, sx + radius), sx + size - radius);
  const cy = Math.min(Math.max(y, sy + radius), sy + size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

// A bold condensed "P": a stem, and a bowl of even thickness closed by a
// half circle on the right.
const P = { left: 338, top: 232, bottom: 792, stem: 124, bowlBottom: 568, bowlRight: 686, weight: 116 };

function inP(x, y) {
  const { left, top, bottom, stem, bowlBottom, bowlRight, weight } = P;
  if (x >= left && x <= left + stem && y >= top && y <= bottom) return true;
  const r = (bowlBottom - top) / 2;
  const cy = top + r;
  const cx = bowlRight - r;
  const inner = r - weight;
  const outerBowl = y >= top && y <= bowlBottom && x >= left && (x <= cx || (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  if (!outerBowl) return false;
  const counter = y > top + weight && y < bowlBottom - weight && x > left + stem && (x <= cx || (x - cx) ** 2 + (y - cy) ** 2 < inner * inner);
  return !counter;
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let square = 0;
    let ink = 0;
    for (let sy = 0; sy < AA; sy++) {
      for (let sx = 0; sx < AA; sx++) {
        const x = px + (sx + 0.5) / AA;
        const y = py + (sy + 0.5) / AA;
        if (!inSquare(x, y)) continue;
        square += 1;
        if (inP(x, y)) ink += 1;
      }
    }
    const i = (py * SIZE + px) * 4;
    if (square === 0) continue;
    const t = ink / square;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BACKGROUND[c] * (1 - t) + INK[c] * t);
    rgba[i + 3] = Math.round((255 * square) / (AA * AA));
  }
}

// PNG: signature, IHDR, one IDAT of filter-0 rows, IEND.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) rgba.copy(rows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = fileURLToPath(new URL('../build/icon.png', import.meta.url));
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
