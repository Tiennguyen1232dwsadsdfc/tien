import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util/fs.js';

/**
 * Provider offline: ve mot anh gradient + so thu tu.
 * Dung de thu toan bo pipeline (timeline, draft CapCut) khi chua co API key,
 * tranh phai tra tien chi de kiem tra phan dung phim.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function makePng(width, height, painter) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = painter(x, y);
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createPlaceholder(config) {
  return {
    name: 'placeholder',
    ext: 'png',
    async generate({ prompt, outFile, index = 0 }) {
      // Mau nen suy ra tu prompt -> anh khac nhau nhung on dinh giua cac lan chay.
      let hash = 0;
      for (const ch of `${index}:${prompt}`) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
      const hue = hash;
      const w = Math.min(config.width, 960);
      const h = Math.round((w * config.height) / config.width);
      const buf = makePng(w, h, (x, y) => {
        const t = (x / w) * 0.6 + (y / h) * 0.4;
        const l = 0.25 + t * 0.5;
        return hsl(hue / 360, 0.45, l);
      });
      ensureDir(path.dirname(outFile));
      fs.writeFileSync(outFile, buf);
      return { file: outFile, width: w, height: h, bytes: buf.length };
    },
  };
}

function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}
