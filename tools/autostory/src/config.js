import fs from 'node:fs';
import path from 'node:path';

/** Doc file .env don gian (khong can dotenv) — bo qua dong trong va comment. */
export function loadEnvFile(file = '.env') {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) return;
  for (const raw of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|y|on)$/i.test(String(value));
};

export function getConfig(overrides = {}) {
  const env = process.env;
  const cfg = {
    // Video
    width: num(env.VIDEO_WIDTH, 1920),
    height: num(env.VIDEO_HEIGHT, 1080),
    fps: num(env.VIDEO_FPS, 30),

    // Timeline
    maxImageSeconds: num(env.MAX_IMAGE_SECONDS, 8),
    minImageSeconds: num(env.MIN_IMAGE_SECONDS, 2.5),
    lineGapSeconds: num(env.LINE_GAP_SECONDS, 0.25),
    transitionSeconds: num(env.TRANSITION_SECONDS, 0),

    // TTS
    ttsProvider: env.TTS_PROVIDER || 'elevenlabs',
    ttsConcurrency: num(env.TTS_CONCURRENCY, 2),
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY || '',
      model: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voiceId: env.ELEVENLABS_VOICE_ID || '',
      outputFormat: env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128',
      stability: num(env.ELEVENLABS_STABILITY, 0.5),
      similarityBoost: num(env.ELEVENLABS_SIMILARITY, 0.8),
      style: num(env.ELEVENLABS_STYLE, 0),
      speed: num(env.ELEVENLABS_SPEED, 1),
      baseUrl: env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io',
    },
    minimax: {
      apiKey: env.MINIMAX_API_KEY || '',
      groupId: env.MINIMAX_GROUP_ID || '',
      baseUrl: env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat',
      model: env.MINIMAX_MODEL || 'speech-02-hd',
      voiceId: env.MINIMAX_VOICE_ID || '',
      speed: num(env.MINIMAX_SPEED, 1),
      volume: num(env.MINIMAX_VOLUME, 1),
      pitch: num(env.MINIMAX_PITCH, 0),
      emotion: env.MINIMAX_EMOTION || '',
      sampleRate: num(env.MINIMAX_SAMPLE_RATE, 32000),
      bitrate: num(env.MINIMAX_BITRATE, 128000),
      format: env.MINIMAX_FORMAT || 'mp3',
    },

    // Prompt anh
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.ANTHROPIC_MODEL || 'claude-opus-5',
      batchSize: num(env.PROMPT_BATCH_SIZE, 20),
    },

    // Sinh anh
    imageProvider: env.IMAGE_PROVIDER || 'gemini',
    imageConcurrency: num(env.IMAGE_CONCURRENCY, 2),
    imageStyle:
      env.IMAGE_STYLE ||
      'cinematic digital painting, warm rim light, rich detail, 16:9 composition',
    gemini: {
      apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
      model: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
      baseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    },
    whisk: {
      url: env.WHISK_URL || 'https://labs.google/fx/tools/whisk',
      profileDir: env.WHISK_PROFILE_DIR || '.autostory/whisk-profile',
      headless: bool(env.WHISK_HEADLESS, false),
      timeoutMs: num(env.WHISK_TIMEOUT_MS, 180000),
      perPrompt: num(env.WHISK_IMAGES_PER_PROMPT, 1),
      selectorsFile: env.WHISK_SELECTORS_FILE || '',
    },

    // Hieu ung Ken Burns
    kenBurns: {
      enabled: bool(env.KENBURNS_ENABLED, true),
      zoomMin: num(env.KENBURNS_ZOOM_MIN, 1.06),
      zoomMax: num(env.KENBURNS_ZOOM_MAX, 1.22),
      moves: (env.KENBURNS_MOVES || 'zoom-in,zoom-out,pan-left,pan-right,zoom-in-pan-left,zoom-out-pan-right')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      seed: num(env.KENBURNS_SEED, 20240915),
    },

    // CapCut
    capcutDraftDir: env.CAPCUT_DRAFT_DIR || '',
    capcutAppVersion: env.CAPCUT_APP_VERSION || '5.9.0',

    workDir: env.AUTOSTORY_WORK_DIR || 'autostory-projects',
  };

  return deepMerge(cfg, overrides);
}

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
