// Génère des icônes PNG (192 & 512) pour le manifest PWA (B37).
// Android/iOS attendent des PNG ; un seul SVG peut donner un rendu dégradé à
// l'installation. On produit un carré de la couleur brand #1c282c.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = Number(process.argv[2] ?? 192);
const BRAND = [0x1c, 0x28, 0x2c];

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function makePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter byte
    for (let x = 0; x < size; x += 1) {
      const px = rowStart + 1 + x * 3;
      raw[px] = BRAND[0]; raw[px + 1] = BRAND[1]; raw[px + 2] = BRAND[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, `icon-${SIZE}.png`), makePng(SIZE));
console.log(`Wrote public/icon-${SIZE}.png`);
