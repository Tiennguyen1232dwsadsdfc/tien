import fs from 'node:fs';
import path from 'node:path';
import { fetchRetry } from '../util/http.js';
import { audioDuration } from '../util/audio.js';
import { ensureDir } from '../util/fs.js';

function headers(cfg, extra = {}) {
  if (!cfg.apiKey) throw new Error('Thieu MINIMAX_API_KEY trong .env');
  return { Authorization: `Bearer ${cfg.apiKey}`, ...extra };
}

function withGroup(url, cfg) {
  return cfg.groupId ? `${url}${url.includes('?') ? '&' : '?'}GroupId=${encodeURIComponent(cfg.groupId)}` : url;
}

/** Minimax tra loi 200 kem base_resp.status_code != 0 khi loi -> phai tu kiem. */
function assertOk(data, label) {
  const code = data?.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    throw new Error(`${label} loi ${code}: ${data.base_resp.status_msg || 'khong ro'}`);
  }
  return data;
}

export function createMinimax(cfg) {
  const base = cfg.baseUrl.replace(/\/$/, '');

  return {
    name: 'minimax',
    ext: cfg.format === 'wav' || cfg.format === 'pcm' ? 'wav' : 'mp3',

    async listVoices() {
      const res = await fetchRetry(
        withGroup(`${base}/v1/get_voice`, cfg),
        {
          method: 'POST',
          headers: headers(cfg, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ voice_type: 'all' }),
        },
        { label: 'minimax/voices' },
      );
      const data = assertOk(await res.json(), 'minimax/get_voice');
      const groups = [
        ['system', data.system_voice],
        ['clone', data.voice_cloning],
        ['generated', data.voice_generation],
        ['music', data.music_generation],
      ];
      const out = [];
      for (const [category, list] of groups) {
        for (const v of list || []) {
          out.push({
            id: v.voice_id || v.voice_ID,
            name: v.voice_name || v.description?.join?.(', ') || v.voice_id,
            category,
          });
        }
      }
      return out;
    },

    /** Clone giong: upload file mau -> tao voice_id. Can quyen dung giong do. */
    async cloneVoice({ name, files }) {
      if (!files?.length) throw new Error('Can it nhat 1 file mau de clone giong');
      const form = new FormData();
      form.append('purpose', 'voice_clone');
      form.append('file', new Blob([fs.readFileSync(files[0])]), path.basename(files[0]));
      const upload = await fetchRetry(
        withGroup(`${base}/v1/files/upload`, cfg),
        { method: 'POST', headers: headers(cfg), body: form },
        { label: 'minimax/upload' },
      );
      const uploaded = assertOk(await upload.json(), 'minimax/upload');
      const fileId = uploaded.file?.file_id;
      if (!fileId) throw new Error('Upload thanh cong nhung khong nhan duoc file_id');

      const voiceId = name.replace(/[^a-zA-Z0-9]/g, '') || `clone${Date.now()}`;
      const res = await fetchRetry(
        withGroup(`${base}/v1/voice_clone`, cfg),
        {
          method: 'POST',
          headers: headers(cfg, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ file_id: fileId, voice_id: voiceId }),
        },
        { label: 'minimax/voice_clone' },
      );
      assertOk(await res.json(), 'minimax/voice_clone');
      return { id: voiceId, name };
    },

    async synthesize({ text, voiceId, outFile }) {
      const voice = voiceId || cfg.voiceId;
      if (!voice) throw new Error('Thieu voice id (MINIMAX_VOICE_ID hoac @voice trong kich ban)');

      const body = {
        model: cfg.model,
        text,
        stream: false,
        voice_setting: {
          voice_id: voice,
          speed: cfg.speed,
          vol: cfg.volume,
          pitch: cfg.pitch,
          ...(cfg.emotion ? { emotion: cfg.emotion } : {}),
        },
        audio_setting: {
          sample_rate: cfg.sampleRate,
          bitrate: cfg.bitrate,
          format: cfg.format,
          channel: 1,
        },
      };

      const res = await fetchRetry(
        withGroup(`${base}/v1/t2a_v2`, cfg),
        { method: 'POST', headers: headers(cfg, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) },
        { label: 'minimax/tts' },
      );
      const data = assertOk(await res.json(), 'minimax/t2a_v2');
      const hex = data.data?.audio;
      if (!hex) throw new Error('Minimax khong tra ve du lieu audio');
      const buf = Buffer.from(hex, 'hex');
      ensureDir(path.dirname(outFile));
      fs.writeFileSync(outFile, buf);

      // extra_info.audio_length la milli-giay va chinh xac hon parser mp3.
      const ms = Number(data.extra_info?.audio_length);
      const duration = Number.isFinite(ms) && ms > 0 ? ms / 1000 : audioDuration(buf, cfg.format);

      return { file: outFile, duration, bytes: buf.length, alignment: null };
    },
  };
}
