import { createElevenLabs } from './elevenlabs.js';
import { createMinimax } from './minimax.js';
import { createMockTts } from './mock.js';

export function createTts(config, provider = config.ttsProvider) {
  switch ((provider || '').toLowerCase()) {
    case 'elevenlabs':
    case '11labs':
      return createElevenLabs(config.elevenlabs);
    case 'minimax':
      return createMinimax(config.minimax);
    case 'mock':
      return createMockTts();
    default:
      throw new Error(`TTS provider khong ho tro: ${provider}. Dung "elevenlabs", "minimax" hoac "mock".`);
  }
}
