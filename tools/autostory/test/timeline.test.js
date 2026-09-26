import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, toSrt } from '../src/timeline.js';
import { getConfig } from '../src/config.js';

const config = getConfig({ maxImageSeconds: 8, minImageSeconds: 2.5, lineGapSeconds: 0.25 });
const lines = [
  { id: 'L1', index: 0, sceneIndex: 0, text: 'Mot' },
  { id: 'L2', index: 1, sceneIndex: 0, text: 'Hai' },
  { id: 'L3', index: 2, sceneIndex: 1, text: 'Ba' },
];

test('anh phu kin timeline, khong ho va khong chong', () => {
  const audio = [
    { id: 'L1', duration: 4 },
    { id: 'L2', duration: 21 },
    { id: 'L3', duration: 3 },
  ];
  const t = buildTimeline({ lines, audio, config });
  let cursor = 0;
  for (const seg of t.imageSegments) {
    assert.ok(Math.abs(seg.start - cursor) < 1e-9, `khe ho tai ${seg.imageId}`);
    cursor = seg.start + seg.duration;
  }
  assert.ok(Math.abs(cursor - t.duration) < 1e-9);
});

test('cau dai duoc chia nhieu anh, cau ngan chi mot anh', () => {
  const audio = [
    { id: 'L1', duration: 4 },
    { id: 'L2', duration: 21 },
    { id: 'L3', duration: 3 },
  ];
  const t = buildTimeline({ lines, audio, config });
  const perLine = (id) => t.imageSegments.filter((s) => s.lineId === id).length;
  assert.equal(perLine('L1'), 1);
  assert.equal(perLine('L2'), 3);
  assert.equal(perLine('L3'), 1);
});

test('khong tao anh ngan hon minImageSeconds khi co the tranh', () => {
  const audio = lines.map((l) => ({ id: l.id, duration: 9 }));
  const t = buildTimeline({ lines, audio, config });
  for (const seg of t.imageSegments) {
    assert.ok(seg.duration >= config.minImageSeconds - 1e-9, `anh ${seg.imageId} chi ${seg.duration}s`);
  }
});

test('giong doc bat dau dung sau khoang nghi cua cau truoc', () => {
  const audio = [
    { id: 'L1', duration: 4 },
    { id: 'L2', duration: 5 },
    { id: 'L3', duration: 3 },
  ];
  const t = buildTimeline({ lines, audio, config });
  assert.equal(t.audioSegments[0].start, 0);
  assert.ok(Math.abs(t.audioSegments[1].start - 4.25) < 1e-9);
  assert.ok(Math.abs(t.audioSegments[2].start - 9.5) < 1e-9);
});

test('cau cuoi khong co khoang nghi thua o duoi', () => {
  const audio = lines.map((l) => ({ id: l.id, duration: 3 }));
  const t = buildTimeline({ lines, audio, config });
  const last = t.audioSegments[2];
  assert.ok(Math.abs(t.duration - (last.start + last.duration)) < 1e-9);
});

test('srt dung dinh dang thoi gian', () => {
  const t = buildTimeline({ lines, audio: lines.map((l) => ({ id: l.id, duration: 2 })), config });
  const srt = toSrt(t.audioSegments);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,000\nMot\n/);
  assert.match(srt, /00:00:02,250 --> 00:00:04,250/);
});
