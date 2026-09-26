import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from '../src/config.js';
import { buildTimeline } from '../src/timeline.js';
import { buildDraft, writeDraftFolder } from '../src/capcut/draft.js';
import { validateDraft } from '../src/capcut/validate.js';
import { createPlaceholder } from '../src/images/placeholder.js';
import { createMockTts } from '../src/tts/mock.js';

const config = getConfig({ width: 1920, height: 1080, fps: 30 });

async function fixture(lineCount = 4) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostory-'));
  const tts = createMockTts();
  const images = createPlaceholder(config);
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    id: `L${i + 1}`,
    index: i,
    sceneIndex: 0,
    text: `Cau thoai so ${i + 1}, dai vua du de doc trong vai giay lien tuc.`,
  }));
  const audio = [];
  for (const line of lines) {
    const result = await tts.synthesize({ text: line.text, outFile: path.join(dir, `${line.id}.wav`) });
    audio.push({ id: line.id, file: result.file, duration: result.duration });
  }
  const timeline = buildTimeline({ lines, audio, config });
  const imageFiles = [];
  for (const seg of timeline.imageSegments) {
    const result = await images.generate({ prompt: seg.imageId, outFile: path.join(dir, `${seg.imageId}.png`) });
    imageFiles.push({ imageId: seg.imageId, file: result.file, width: result.width, height: result.height });
  }
  return { dir, timeline, images: imageFiles };
}

test('draft sinh ra hop le va khong co khe ho', async () => {
  const { timeline, images } = await fixture();
  const { draft, missing } = buildDraft({ timeline, images, config, name: 'test' });
  assert.deepEqual(missing, []);
  const result = validateDraft(draft);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.ok);
});

test('bien clip khop tuyet doi tung micro-giay', async () => {
  const { timeline, images } = await fixture(6);
  const { draft } = buildDraft({ timeline, images, config, name: 'test' });
  const video = draft.tracks.find((t) => t.type === 'video');
  let cursor = 0;
  for (const seg of video.segments) {
    assert.equal(seg.target_timerange.start, cursor, 'clip khong noi lien');
    cursor = seg.target_timerange.start + seg.target_timerange.duration;
  }
  assert.equal(cursor, draft.duration);
});

test('keyframe Ken Burns nam trong pham vi clip', async () => {
  const { timeline, images } = await fixture();
  const { draft } = buildDraft({ timeline, images, config, name: 'test' });
  const video = draft.tracks.find((t) => t.type === 'video');
  for (const seg of video.segments) {
    assert.ok(seg.common_keyframes.length >= 2, 'thieu keyframe scale');
    for (const kf of seg.common_keyframes) {
      const times = kf.keyframe_list.map((p) => p.time_offset);
      assert.equal(times[0], 0);
      assert.equal(times[times.length - 1], seg.target_timerange.duration);
    }
  }
});

test('tat Ken Burns thi khong sinh keyframe', async () => {
  const { timeline, images } = await fixture(2);
  const off = getConfig({ kenBurns: { enabled: false } });
  const { draft } = buildDraft({ timeline, images, config: off, name: 'test' });
  const video = draft.tracks.find((t) => t.type === 'video');
  for (const seg of video.segments) assert.deepEqual(seg.common_keyframes, []);
});

test('thieu file anh thi bao missing chu khong tao segment treo', async () => {
  const { timeline, images } = await fixture(3);
  const broken = images.map((img, i) => (i === 1 ? { ...img, file: '/khong/ton/tai.png' } : img));
  const { draft, missing } = buildDraft({ timeline, images: broken, config, name: 'test' });
  assert.equal(missing.length, 1);
  const video = draft.tracks.find((t) => t.type === 'video');
  assert.equal(video.segments.length, timeline.imageSegments.length - 1);
});

test('bat --subtitles thi co track text', async () => {
  const { timeline, images } = await fixture(3);
  const { draft } = buildDraft({ timeline, images, config, name: 'test', subtitles: true });
  const text = draft.tracks.find((t) => t.type === 'text');
  assert.equal(text.segments.length, timeline.audioSegments.length);
  assert.equal(draft.materials.texts.length, timeline.audioSegments.length);
  assert.match(draft.materials.texts[0].content, /"text":"Cau thoai so 1/);
});

test('ghi ra thu muc draft doc duoc boi CapCut', async () => {
  const { dir, timeline, images } = await fixture(2);
  const { draft } = buildDraft({ timeline, images, config, name: 'video-test' });
  const folder = writeDraftFolder({ draft, draftDir: path.join(dir, 'drafts'), name: 'video-test', timeline });
  const content = JSON.parse(fs.readFileSync(path.join(folder, 'draft_content.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(folder, 'draft_meta_info.json'), 'utf8'));
  assert.equal(meta.draft_name, 'video-test');
  assert.equal(meta.draft_id, content.id);
  assert.equal(meta.tm_duration, content.duration);
});

test('validateDraft bat duoc extra_material_ref treo', async () => {
  const { timeline, images } = await fixture(2);
  const { draft } = buildDraft({ timeline, images, config, name: 'test' });
  draft.tracks[0].segments[0].extra_material_refs.push('KHONG-TON-TAI');
  const result = validateDraft(draft);
  assert.ok(!result.ok);
  assert.match(result.problems.join(' '), /treo/);
});
