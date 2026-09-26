import fs from 'node:fs';
import path from 'node:path';
import { fetchRetry } from '../util/http.js';
import { ensureDir } from '../util/fs.js';

/**
 * Sinh anh qua Google AI Studio API (co API chinh thuc, on dinh hon Whisk).
 * Ho tro ca model gemini-*-image (generateContent) va imagen-* (predict).
 */
export function createGemini(cfg, config) {
  if (!cfg.apiKey) {
    throw new Error('Thieu GEMINI_API_KEY trong .env (lay o https://aistudio.google.com/apikey)');
  }
  const base = cfg.baseUrl.replace(/\/$/, '');
  const isImagen = /^imagen/i.test(cfg.model);
  const aspect = config.width >= config.height ? '16:9' : '9:16';

  async function viaGenerateContent(prompt) {
    const res = await fetchRetry(
      `${base}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: aspect },
          },
        }),
      },
      { label: 'gemini/image' },
    );
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const inline = parts.find((p) => p.inlineData?.data);
    if (!inline) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'khong ro';
      throw new Error(`Gemini khong tra ve anh (ly do: ${reason})`);
    }
    return { buf: Buffer.from(inline.inlineData.data, 'base64'), mime: inline.inlineData.mimeType };
  }

  async function viaImagen(prompt, negative) {
    const res = await fetchRetry(
      `${base}/v1beta/models/${encodeURIComponent(cfg.model)}:predict`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspect,
            ...(negative ? { negativePrompt: negative } : {}),
          },
        }),
      },
      { label: 'imagen/image' },
    );
    const data = await res.json();
    const pred = data.predictions?.[0];
    if (!pred?.bytesBase64Encoded) throw new Error('Imagen khong tra ve anh');
    return { buf: Buffer.from(pred.bytesBase64Encoded, 'base64'), mime: pred.mimeType || 'image/png' };
  }

  return {
    name: `gemini:${cfg.model}`,
    ext: 'png',
    async generate({ prompt, negative, outFile }) {
      // Model generateContent khong co truong negative rieng -> gop vao prompt.
      const full = !isImagen && negative ? `${prompt}\nAvoid: ${negative}` : prompt;
      const { buf, mime } = isImagen ? await viaImagen(prompt, negative) : await viaGenerateContent(full);
      const ext = mime?.includes('jpeg') ? 'jpg' : 'png';
      const target = outFile.replace(/\.[a-z0-9]+$/i, `.${ext}`);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, buf);
      return { file: target, bytes: buf.length };
    },
  };
}
