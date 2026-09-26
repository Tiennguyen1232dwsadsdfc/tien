import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    if (err.code === 'ENOENT') throw new Error(`Khong tim thay file: ${file}`);
    throw new Error(`File JSON loi (${file}): ${err.message}`);
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

export function writeFileSafe(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, data);
  return file;
}

/** Ten file an toan cho moi he dieu hanh, giu duoc chu co dau. */
export function slugify(text, maxLen = 48) {
  const cleaned = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'untitled').slice(0, maxLen);
}

export function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

/** CapCut doc duong dan tuyet doi; tren Windows no dung dau /. */
export function capcutPath(p) {
  return path.resolve(p).replace(/\\/g, '/');
}
