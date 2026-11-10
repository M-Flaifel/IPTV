// Packages the Tizen web app build into an installable widget.
//
// A Tizen WGT is a ZIP archive holding config.xml, index.html, and the app
// assets at its root. This script is dependency-free on purpose (no new npm
// packages): it walks dist-tizen/, copies the Tizen metadata in, and writes
// IPTV.wgt itself. ZIP entry names always use forward slashes because
// Windows archive tooling cannot be relied upon to do so.
//
// The widget is left unsigned. Apps2Samsung (or Tizen Studio's CLI) signs
// it with the Samsung certificate during installation.

import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'dist-tizen');
const tizenDir = join(root, 'tizen');
const wgtPath = join(root, 'IPTV.wgt');

function fail(message) {
  console.error(`package-tizen: ${message}`);
  process.exit(1);
}

if (!existsSync(join(buildDir, 'index.html'))) {
  fail(
    'dist-tizen/index.html not found. Run the full script first: ' +
      'npm run build:tizen (vite build --mode tizen runs before this file).'
  );
}

for (const name of ['config.xml', 'icon.png']) {
  const source = join(tizenDir, name);
  if (!existsSync(source)) {
    fail(`missing tizen/${name}`);
  }
  copyFileSync(source, join(buildDir, name));
}

const packageVersion = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
).version;
const configVersion = /<widget[^>]*\sversion="([^"]+)"/.exec(
  readFileSync(join(buildDir, 'config.xml'), 'utf8')
)?.[1];

if (configVersion && configVersion !== packageVersion) {
  console.warn(
    `config.xml version ${configVersion} differs from package.json ` +
      `${packageVersion}; TV updates only replace an older widget.`
  );
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(abs));
    } else if (entry.isFile()) {
      found.push(abs);
    }
  }
  return found;
}

const files = walk(buildDir)
  .map((abs) => ({
    abs,
    name: relative(buildDir, abs).split(sep).join('/'),
  }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// --- Minimal ZIP writer: local headers, central directory, EOCD. ----------

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

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear()) - 1980;
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, day: day & 0xffff };
}

const chunks = [];
const central = [];
let offset = 0;

function emit(buf) {
  chunks.push(buf);
  offset += buf.length;
}

for (const file of files) {
  const data = readFileSync(file.abs);
  const packed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file.name, 'utf8');
  const crc = crc32(data);
  const { time, day } = dosDateTime(statSync(file.abs).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // flags: UTF-8 entry names
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra field length

  const headerOffset = offset;
  emit(local);
  emit(name);
  emit(packed);

  central.push({ name, crc, packedLength: packed.length, length: data.length, time, day, headerOffset });
}

const centralStart = offset;

for (const entry of central) {
  const rec = Buffer.alloc(46);
  rec.writeUInt32LE(0x02014b50, 0); // central directory signature
  rec.writeUInt16LE(20, 4); // version made by
  rec.writeUInt16LE(20, 6); // version needed
  rec.writeUInt16LE(0x0800, 8); // flags: UTF-8 entry names
  rec.writeUInt16LE(8, 10); // method: deflate
  rec.writeUInt16LE(entry.time, 12);
  rec.writeUInt16LE(entry.day, 14);
  rec.writeUInt32LE(entry.crc, 16);
  rec.writeUInt32LE(entry.packedLength, 20);
  rec.writeUInt32LE(entry.length, 24);
  rec.writeUInt16LE(entry.name.length, 28);
  rec.writeUInt16LE(0, 30); // extra field length
  rec.writeUInt16LE(0, 32); // file comment length
  rec.writeUInt16LE(0, 34); // disk number start
  rec.writeUInt16LE(0, 36); // internal attributes
  rec.writeUInt32LE(0o100644 * 0x10000, 38); // external attributes: -rw-r--r--
  rec.writeUInt32LE(entry.headerOffset, 42);

  emit(rec);
  emit(entry.name);
}

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
eocd.writeUInt16LE(0, 4); // number of this disk
eocd.writeUInt16LE(0, 6); // disk with the central directory
eocd.writeUInt16LE(central.length, 8); // entries on this disk
eocd.writeUInt16LE(central.length, 10); // total entries
eocd.writeUInt32LE(offset - centralStart, 12); // central directory size
eocd.writeUInt32LE(centralStart, 16); // central directory offset
eocd.writeUInt16LE(0, 20); // comment length
emit(eocd);

writeFileSync(wgtPath, Buffer.concat(chunks));

const size = statSync(wgtPath).size;
console.log(
  `package-tizen: wrote ${wgtPath} (${files.length} entries, ` +
    `${(size / 1024).toFixed(0)} KiB, unsigned)`
);
console.log(
  'package-tizen: install it with Apps2Samsung -> Custom WGT, or ' +
    'sdb after connecting in TV Developer Mode.'
);
