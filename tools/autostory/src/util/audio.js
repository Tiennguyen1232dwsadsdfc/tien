/**
 * Do do dai file audio khong can ffmpeg.
 * Cac API TTS deu tra ve mp3/wav nen chi can 2 parser nay; timeline CapCut
 * phu thuoc truc tiep vao do chinh xac o day.
 */

const SAMPLE_RATES = {
  1: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  25: [11025, 12000, 8000], // MPEG 2.5
};

// kbps theo bitrate index, cho Layer III
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};

function id3v2Size(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return size + 10;
}

/** Doc do dai mp3 (giay) bang cach cong don do dai tung frame. */
export function mp3Duration(buf) {
  let offset = id3v2Size(buf);
  let samples = 0;
  let sampleRate = 0;
  let frames = 0;

  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const versionBits = (buf[offset + 1] >> 3) & 0x03;
    const layerBits = (buf[offset + 1] >> 1) & 0x03;
    if (versionBits === 1 || layerBits === 0) {
      offset += 1;
      continue;
    }
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25;
    const bitrateIndex = (buf[offset + 2] >> 4) & 0x0f;
    const rateIndex = (buf[offset + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1;
      continue;
    }
    const table = version === 1 ? BITRATES[1] : BITRATES[2];
    const bitrate = table[bitrateIndex] * 1000;
    sampleRate = SAMPLE_RATES[version][rateIndex];
    const samplesPerFrame = version === 1 ? 1152 : 576;
    const padding = (buf[offset + 2] >> 1) & 0x01;
    const frameLength = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (frameLength <= 4) {
      offset += 1;
      continue;
    }
    samples += samplesPerFrame;
    frames += 1;
    offset += frameLength;
  }

  if (!frames || !sampleRate) return 0;
  return samples / sampleRate;
}

/** Doc do dai wav tu chunk fmt + data. */
export function wavDuration(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF') return 0;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('latin1', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 8 + 16 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (id === 'data') {
      dataSize = Math.min(size, buf.length - offset - 8);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize) return 0;
  return dataSize / byteRate;
}

/** Tra ve do dai (giay) cua buffer audio, 0 neu khong doc duoc. */
export function audioDuration(buf, hint = '') {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return 0;
  const isWav = /wav|pcm/i.test(hint) || buf.toString('latin1', 0, 4) === 'RIFF';
  const seconds = isWav ? wavDuration(buf) : mp3Duration(buf);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}
