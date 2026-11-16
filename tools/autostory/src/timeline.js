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
      overlay: line.overlay || '',
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

/**
 * Xuat danh sach chu can dat tren video, kem moc thoi gian that.
 * CapCut doi dinh dang material text theo phien ban nen autostory khong ghi
 * chu truc tiep vao draft; file nay de dan tay trong CapCut, va la cho duy nhat
 * giu lai khuyen cao bat buoc o dang chu.
 */
export function toOverlayPlan(audioSegments, fps = 30) {
  const rows = audioSegments
    .filter((seg) => seg.overlay)
    .map((seg) => {
      const end = seg.start + seg.duration;
      return `| ${formatTimecode(seg.start, fps)} | ${formatTimecode(end, fps)} | ${(end - seg.start).toFixed(1)}s | ${seg.overlay.replace(/\|/g, '\\|')} |`;
    });
  if (!rows.length) {
    return '# Chu tren man hinh\n\nKich ban khong khai bao lop chu nao.\n';
  }
  return [
    '# Chữ trên màn hình — dán tay trong CapCut',
    '',
    'Autostory dựng được hình, tiếng và hiệu ứng, nhưng **không** dựng lớp chữ:',
    'định dạng text của CapCut đổi theo phiên bản nên ghi vào draft rất dễ làm hỏng',
    'project. Bảng dưới là chữ cần đặt, kèm mốc thời gian thật đã khớp giọng đọc.',
    '',
    '**Chưa đặt xong lớp chữ thì video chưa chạy được** — khuyến cáo bắt buộc và',
    'lời kêu gọi hành động đều nằm ở lớp này.',
    '',
    'Thông số chữ: cỡ tối thiểu 90px trên khung 1080×1920 (chữ chính 110-130px),',
    'font đậm không chân, có hộp nền đậm phía sau, tránh 250px trên và 400px dưới.',
    '',
    '| Vào | Ra | Dài | Chữ |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n') + '\n';
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
