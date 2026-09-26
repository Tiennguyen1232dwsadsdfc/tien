import Anthropic from '@anthropic-ai/sdk';
import { log } from '../util/log.js';

/**
 * Bien tung cau thoai thanh mot prompt anh minh hoa.
 *
 * Hai buoc, vi day la diem quyet dinh do "dinh" cua video:
 *  1. Dung mot "story bible" — nhan vat, boi canh, bang mau — tu toan bo kich ban.
 *  2. Sinh prompt cho tung cau, luon nhac lai mo ta nhan vat, nho vay nhan vat
 *     khong doi mat doi ao giua cac anh.
 */

const SYSTEM_BIBLE = `Bạn là art director cho video kể truyện.
Đọc toàn bộ kịch bản và trả về DUY NHẤT một JSON object, không giải thích, không markdown fence:
{
  "style": "câu mô tả phong cách hình ảnh chung, bằng tiếng Anh",
  "palette": "bảng màu chính, tiếng Anh",
  "characters": [{"name": "tên trong kịch bản", "look": "mô tả ngoại hình cố định, tiếng Anh, 15-30 từ"}],
  "settings": [{"name": "tên bối cảnh", "look": "mô tả bối cảnh, tiếng Anh, 10-25 từ"}]
}
Quy tắc: mô tả ngoại hình phải cụ thể (tuổi, khuôn mặt, tóc, trang phục, màu sắc) để mọi ảnh vẽ ra cùng một người.`;

const SYSTEM_PROMPTS = `Bạn viết prompt cho model sinh ảnh, minh hoạ cho video kể truyện.
Với mỗi câu thoại được đánh số, viết một prompt tiếng Anh mô tả MỘT khung hình tĩnh minh hoạ đúng nội dung câu đó.
Trả về DUY NHẤT một JSON array, không giải thích, không markdown fence:
[{"id": "L0001", "prompt": "...", "negative": "..."}]
Quy tắc:
- Prompt 25-60 từ, tiếng Anh, tả được: chủ thể, hành động, bối cảnh, ánh sáng, góc máy.
- Nhân vật nào xuất hiện thì chèn nguyên mô tả ngoại hình từ story bible vào prompt, không viết lại khác đi.
- Luôn kết thúc bằng phong cách và bảng màu của story bible để mọi ảnh cùng một tông.
- Khung hình ngang 16:9, KHÔNG có chữ, không watermark, không khung viền, không ảnh ghép nhiều ô.
- "negative": các thứ cần tránh (text, watermark, extra fingers, collage...).
- Trả đúng số phần tử và đúng id được yêu cầu, giữ nguyên thứ tự.`;

/** Lay JSON tu cau tra loi, chiu duoc ca truong hop model boc trong ``` fence. */
export function extractJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/,'').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Quet lay khoi { } hoac [ ] dai nhat.
    const first = cleaned.search(/[[{]/);
    const last = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new Error(`Khong doc duoc JSON tu cau tra loi:\n${text.slice(0, 400)}`);
  }
}

async function ask(client, { model, system, user, maxTokens = 16000 }) {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error(`Model tu choi yeu cau: ${message.stop_details?.explanation || 'khong ro ly do'}`);
  }
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Prompt du phong khi khong co ANTHROPIC_API_KEY: ghep truc tiep tu kich ban. */
export function fallbackPrompts(lines, { style }) {
  return lines.map((line) => ({
    id: line.id,
    prompt: [line.imageHint || line.text, style].filter(Boolean).join(', '),
    negative: 'text, watermark, signature, collage, split frame, extra fingers, blurry',
    source: 'fallback',
  }));
}

export async function buildStoryBible({ script, config }) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const scriptText = script.lines
    .map((l) => `${l.id}${l.sceneTitle ? ` [${l.sceneTitle}]` : ''}: ${l.text}`)
    .join('\n');
  const user = [
    script.meta.title ? `Tên video: ${script.meta.title}` : '',
    script.meta.style ? `Phong cách người dùng yêu cầu: ${script.meta.style}` : `Phong cách mặc định: ${config.imageStyle}`,
    '',
    'Kịch bản:',
    scriptText,
  ]
    .filter(Boolean)
    .join('\n');

  const text = await ask(client, { model: config.anthropic.model, system: SYSTEM_BIBLE, user });
  const bible = extractJson(text);
  bible.characters = bible.characters || [];
  bible.settings = bible.settings || [];
  return bible;
}

export async function generateImagePrompts({ script, config, bible }) {
  if (!config.anthropic.apiKey) {
    log.warn('Khong co ANTHROPIC_API_KEY — dung prompt du phong ghep tu kich ban (chat luong thap hon).');
    return fallbackPrompts(script.lines, { style: script.meta.style || config.imageStyle });
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const bibleText = JSON.stringify(bible, null, 2);
  const size = Math.max(1, config.anthropic.batchSize);
  const out = [];

  for (let start = 0; start < script.lines.length; start += size) {
    const batch = script.lines.slice(start, start + size);
    const user = [
      'Story bible:',
      bibleText,
      '',
      'Các câu thoại cần prompt (giữ nguyên id, đúng thứ tự):',
      ...batch.map((l) => {
        const hint = l.imageHint ? ` (gợi ý ảnh của người dùng: ${l.imageHint})` : '';
        const scene = l.sceneTitle ? ` [cảnh: ${l.sceneTitle}]` : '';
        return `${l.id}${scene}: ${l.text}${hint}`;
      }),
    ].join('\n');

    const text = await ask(client, { model: config.anthropic.model, system: SYSTEM_PROMPTS, user });
    const parsed = extractJson(text);
    const byId = new Map(parsed.map((p) => [p.id, p]));

    for (const line of batch) {
      const hit = byId.get(line.id);
      if (!hit?.prompt) {
        log.warn(`${line.id}: model khong tra prompt — dung prompt du phong cho cau nay.`);
        out.push(fallbackPrompts([line], { style: bible.style || config.imageStyle })[0]);
      } else {
        out.push({
          id: line.id,
          prompt: hit.prompt,
          negative: hit.negative || 'text, watermark, collage, extra fingers',
          source: 'claude',
        });
      }
    }
    log.step(`Prompt anh: ${Math.min(start + size, script.lines.length)}/${script.lines.length}`);
  }

  return out;
}
