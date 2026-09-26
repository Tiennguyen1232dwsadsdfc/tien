import { createGemini } from './gemini.js';
import { createWhisk } from './whisk.js';
import { createPlaceholder } from './placeholder.js';

export function createImageProvider(config, provider = config.imageProvider) {
  switch ((provider || '').toLowerCase()) {
    case 'gemini':
    case 'imagen':
      return createGemini(config.gemini, config);
    case 'whisk':
      return createWhisk(config.whisk);
    case 'placeholder':
    case 'offline':
      return createPlaceholder(config);
    default:
      throw new Error(`Image provider khong ho tro: ${provider}. Dung "gemini", "whisk" hoac "placeholder".`);
  }
}
