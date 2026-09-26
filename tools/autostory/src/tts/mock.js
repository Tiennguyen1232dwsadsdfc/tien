import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util/fs.js';

/**
 * Provider TTS gia lap: tao file WAV im lang co do dai uoc theo so ky tu.
 * Dung de thu phan dung phim (timeline, hieu ung, draft CapCut) ma khong ton
 * quota TTS. Khong dung cho video that.
 */

const CHARS_PER_SECOND = 13;

export function estimateDuration(text) {
  return Math.max(0.6, text.length / CHARS_PER_SECOND + 0.3);
}

function silentWav(seconds, sampleRate = 44100) {
  const samples = Math.round(seconds * sampleRate);
  const dataSize = samples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export function createMockTts() {
  return {
    name: 'mock',
    ext: 'wav',
    async listVoices() {
      return [{ id: 'mock-voice', name: 'Giong gia lap', category: 'mock' }];
    },
    async cloneVoice({ name }) {
      return { id: 'mock-voice', name };
    },
    async synthesize({ text, outFile }) {
      const duration = estimateDuration(text);
      const buf = silentWav(duration);
      ensureDir(path.dirname(outFile));
      fs.writeFileSync(outFile, buf);
      return { file: outFile, duration, bytes: buf.length, alignment: null };
    },
  };
}
