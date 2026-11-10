// Generates tizen/icon.png: the app mark (gold rounded square with the "F")
// centered on the deep-blue brand background. 512x512, opaque, no alpha.
//
// Dependency-free on purpose: this script emits the PNG by hand (IHDR, IDAT,
// IEND) using node:zlib for the compressed scanlines, and 4x supersampling
// so the rounded corners survive TV upscaling without a raster library.
//
// Brand colors come from src/styles/themes.css:
//   background  --bg-primary  #0b1a2b
//   mark plate  --focus-ring #ffc857

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SS = 4; // supersampling factor per axis (16 samples per pixel)

const BG = [0x0b, 0x1a, 0x2b]; // --bg-primary
const PLATE = [0xff, 0xc8, 0x57]; // --focus-ring
const INK = [0x0b, 0x1a, 0x2b]; // --bg-primary, as the in-app mark does

// Gold rounded square, like .top-nav__mark scaled up.
const PLATE_RECT = { x0: 64, y0: 64, x1: 448, y1: 448, r: 72 };

// Geometric "F" on the plate: stem plus two arms.
const GLYPH = [
  { x0: 168, y0: 136, x1: 344, y1: 192 }, // top arm
  { x0: 168, y0: 244, x1: 316, y1: 296 }, // middle arm
  { x0: 168, y0: 136, x1: 224, y1: 376 }, // stem
];

function inRoundedRect(x, y, rect) {
  if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) {
    return false;
  }
  const cx = Math.min(Math.max(x, rect.x0 + rect.r), rect.x1 - rect.r);
  const cy = Math.min(Math.max(y, rect.y0 + rect.r), rect.y1 - rect.r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rect.r * rect.r;
}

function inRect(x, y, rect) {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function sample(x, y) {
  if (!inRoundedRect(x, y, PLATE_RECT)) {
    return BG;
  }
  for (const rect of GLYPH) {
    if (inRect(x, y, rect)) {
      return INK;
    }
  }
  return PLATE;
}

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
let p = 0;
const samples = SS * SS;

for (let y = 0; y < SIZE; y += 1) {
  raw[p++] = 0; // scanline filter: none
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      const py = y + (sy + 0.5) / SS;
      for (let sx = 0; sx < SS; sx += 1) {
        const px = x + (sx + 0.5) / SS;
        const c = sample(px, py);
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    raw[p++] = Math.round(r / samples);
    raw[p++] = Math.round(g / samples);
    raw[p++] = Math.round(b / samples);
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor, no alpha
ihdr[10] = 0; // compression: deflate
ihdr[11] = 0; // filter method
ihdr[12] = 0; // interlace: none

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tizen');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'icon.png');
writeFileSync(outPath, png);

console.log(
  `make-tizen-icon: wrote ${outPath} (${SIZE}x${SIZE}, ${png.length} bytes)`
);
