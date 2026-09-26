import fs from 'node:fs';
import path from 'node:path';
import { fetchRetry } from '../util/http.js';
import { audioDuration } from '../util/audio.js';
import { ensureDir } from '../util/fs.js';

function headers(cfg, extra = {}) {
  if (!cfg.apiKey) throw new Error('Thieu ELEVENLABS_API_KEY trong .env');
  return { 'xi-api-key': cfg.apiKey, ...extra };
}

const extFor = (outputFormat) => (outputFormat?.startsWith('pcm') || outputFormat?.startsWith('wav') ? 'wav' : 'mp3');

export function createElevenLabs(cfg) {
  const base = cfg.baseUrl.replace(/\/$/, '');

  return {
    name: 'elevenlabs',
    ext: extFor(cfg.outputFormat),

    async listVoices() {
      const res = await fetchRetry(`${base}/v1/voices`, { headers: headers(cfg) }, { label: 'elevenlabs/voices' });
      const data = await res.json();
      return (data.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels || {},
        preview: v.preview_url,
      }));
    },

    /**
     * Clone giong tu cac file mau.
     * Ban phai co quyen dung giong noi do — ElevenLabs bat xac nhan dieu nay
     * va tai khoan cua ban chiu trach nhiem neu dung giong nguoi khac.
     */
    async cloneVoice({ name, files, description = '', labels = {} }) {
      const form = new FormData();
      form.append('name', name);
      if (description) form.append('description', description);
      if (Object.keys(labels).length) form.append('labels', JSON.stringify(labels));
      for (const file of files) {
        const buf = fs.readFileSync(file);
        form.append('files', new Blob([buf]), path.basename(file));
      }
      const res = await fetchRetry(
        `${base}/v1/voices/add`,
        { method: 'POST', headers: headers(cfg), body: form },
        { label: 'elevenlabs/clone' },
      );
      const data = await res.json();
      return { id: data.voice_id, name };
    },

    /** Doc mot cau -> file audio + do dai chinh xac. */
    async synthesize({ text, voiceId, outFile, previousText = '', nextText = '' }) {
      const voice = voiceId || cfg.voiceId;
      if (!voice) throw new Error('Thieu voice id (ELEVENLABS_VOICE_ID hoac @voice trong kich ban)');

      const body = {
        text,
        model_id: cfg.model,
        voice_settings: {
          stability: cfg.stability,
          similarity_boost: cfg.similarityBoost,
          style: cfg.style,
          use_speaker_boost: true,
          speed: cfg.speed,
        },
        // Cho model biet cau truoc/sau de ngat giong tu nhien giua cac cau.
        ...(previousText ? { previous_text: previousText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
      };

      // Endpoint with-timestamps tra ve alignment -> do dai chinh xac tuyet doi,
      // khong phai suy ra tu header mp3.
      const url = `${base}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=${encodeURIComponent(cfg.outputFormat)}`;
      const res = await fetchRetry(
        url,
        { method: 'POST', headers: headers(cfg, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) },
        { label: 'elevenlabs/tts' },
      );
      const data = await res.json();
      const buf = Buffer.from(data.audio_base64, 'base64');
      ensureDir(path.dirname(outFile));
      fs.writeFileSync(outFile, buf);

      const ends = data.alignment?.character_end_times_seconds || [];
      const duration = ends.length ? ends[ends.length - 1] : audioDuration(buf, cfg.outputFormat);

      return {
        file: outFile,
        duration,
        bytes: buf.length,
        alignment: data.alignment
          ? {
              characters: data.alignment.characters,
              starts: data.alignment.character_start_times_seconds,
              ends: data.alignment.character_end_times_seconds,
            }
          : null,
      };
    },
  };
}
