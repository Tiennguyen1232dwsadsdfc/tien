import test from 'node:test';
import assert from 'node:assert/strict';
import { audioDuration, mp3Duration, wavDuration } from '../src/util/audio.js';

function fakeMp3(frames, { id3 = 0 } = {}) {
  // MPEG1 Layer III, 128 kbps, 44100 Hz, khong padding -> frame dai 417 byte.
  const frameLength = 417;
  const parts = [];
  if (id3) {
    const header = Buffer.alloc(10 + id3);
    header.write('ID3', 0, 'latin1');
    header[6] = (id3 >> 21) & 0x7f;
    header[7] = (id3 >> 14) & 0x7f;
    header[8] = (id3 >> 7) & 0x7f;
    header[9] = id3 & 0x7f;
    parts.push(header);
  }
  for (let i = 0; i < frames; i += 1) {
    const frame = Buffer.alloc(frameLength);
    frame[0] = 0xff;
    frame[1] = 0xfb;
    frame[2] = 0x90;
    frame[3] = 0x00;
    parts.push(frame);
  }
  return Buffer.concat(parts);
}

function fakeWav(seconds, sampleRate = 44100) {
  const dataSize = Math.round(seconds * sampleRate) * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

test('do do dai mp3 tu so frame', () => {
  const expected = (10 * 1152) / 44100;
  assert.ok(Math.abs(mp3Duration(fakeMp3(10)) - expected) < 1e-6);
});

test('bo qua the ID3 o dau file mp3', () => {
  const expected = (10 * 1152) / 44100;
  assert.ok(Math.abs(mp3Duration(fakeMp3(10, { id3: 500 })) - expected) < 1e-6);
});

test('do do dai wav', () => {
  assert.ok(Math.abs(wavDuration(fakeWav(3.5)) - 3.5) < 1e-3);
});

test('audioDuration tu nhan dang wav va mp3', () => {
  assert.ok(Math.abs(audioDuration(fakeWav(2)) - 2) < 1e-3);
  assert.ok(audioDuration(fakeMp3(5)) > 0.1);
});

test('file rac hoac rong tra ve 0 thay vi crash', () => {
  assert.equal(audioDuration(Buffer.alloc(0)), 0);
  assert.equal(audioDuration(Buffer.from('khong phai audio')), 0);
  assert.equal(audioDuration('khong phai buffer'), 0);
});
