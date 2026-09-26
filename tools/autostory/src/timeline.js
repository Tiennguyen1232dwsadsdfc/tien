import { formatTimecode } from './util/time.js';

/**
 * Xep timeline tu do dai audio that cua tung cau.
 *
 * Nguyen tac: audio la "su that", anh phai chay theo audio.
 * Moi cau chiem [start, end] theo do dai file giong doc; anh minh hoa cua cau
 * do duoc chia deu trong dung khoang ay (+ khoang nghi sau cau, de khong bi
 * khung den giua hai cau). Nho vay giong doc den cau nao thi anh cua cau do
 * dang hien — khong bao gio lech.
 */

function imagesForLine(duration, { maxImageSeconds, minImageSeconds }) {
  if (duration <= 0) return 1;
  // Uoc luong so anh theo do dai toi da, roi ha xuong neu moi anh se qua ngan.
  let count = Math.max(1, Math.ceil(duration / maxImageSeconds));
  while (count > 1 && duration / count < minImageSeconds) count -= 1;
  return count;
}

export function buildTimeline({ lines, audio, config, promptsById = new Map() }) {
  const gap = Math.max(0, config.lineGapSeconds);
  const audioById = new Map(audio.map((a) => [a.id, a]));

  const audioSegments = [];
  const imageSegments = [];
  let cursor = 0;

  lines.forEach((line, lineIdx) => {
    const track = audioById.get(line.id);
    const duration = Math.max(0.1, track?.duration || 0);
    const start = cursor;
    const end = start + duration;
    const isLast = lineIdx === lines.length - 1;
    // Cau cuoi khong can khoang nghi o duoi anh.
    const visualEnd = isLast ? end : end + gap;

    audioSegments.push({
      lineId: line.id,
      file: track?.file,
      start,
      duration,
      text: line.text,
    });

    const count = imagesForLine(visualEnd - start, config);
    const slice = (visualEnd - start) / count;
    for (let i = 0; i < count; i += 1) {
      const segStart = start + slice * i;
      const segEnd = i === count - 1 ? visualEnd : start + slice * (i + 1);
      imageSegments.push({
        lineId: line.id,
        lineIndex: line.index,
        sceneIndex: line.sceneIndex,
        imageIndex: i,
        imageCount: count,
        // Id anh: mot cau co the co nhieu anh -> L0007-2
        imageId: count === 1 ? line.id : `${line.id}-${i + 1}`,
        prompt: promptsById.get(line.id)?.prompt || '',
        negative: promptsById.get(line.id)?.negative || '',
        text: line.text,
        start: segStart,
        duration: segEnd - segStart,
      });
    }

    cursor = visualEnd;
  });

  return {
    duration: cursor,
    audioSegments,
    imageSegments,
    stats: {
      lineCount: lines.length,
      imageCount: imageSegments.length,
      totalSeconds: cursor,
    },
  };
}

/** Xuat phu de .srt — CapCut import truc tiep duoc, ma khong phu thuoc format draft. */
export function toSrt(audioSegments) {
  const stamp = (sec) => {
    const ms = Math.round(sec * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    const milli = String(ms % 1000).padStart(3, '0');
    return `${h}:${m}:${s},${milli}`;
  };
  return audioSegments
    .map((seg, i) => `${i + 1}\n${stamp(seg.start)} --> ${stamp(seg.start + seg.duration)}\n${seg.text}\n`)
    .join('\n');
}

/** Bang timeline de nguoi dung doi chieu nhanh. */
export function toTimelineReport(timeline, fps = 30) {
  const rows = timeline.imageSegments.map((seg) =>
    [
      seg.imageId.padEnd(10),
      formatTimecode(seg.start, fps),
      '->',
      formatTimecode(seg.start + seg.duration, fps),
      `${seg.duration.toFixed(2)}s`.padStart(7),
      seg.text.slice(0, 60),
    ].join(' '),
  );
  return rows.join('\n');
}
