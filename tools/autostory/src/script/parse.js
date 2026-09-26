/**
 * Doc kich ban dang text -> danh sach "loi thoai" (line).
 * Moi line la mot don vi doc: duoc TTS rieng va co it nhat mot anh minh hoa,
 * nho vay timeline khop chinh xac "giong doc den dau, anh den do".
 *
 * Cu phap kich ban:
 *   # ghi chu (bo qua)
 *   @title: Ten video
 *   @style: phong cach anh ap dung cho toan bo video
 *   @voice: voice id cho TTS
 *   == Ten canh ==            -> moc chia canh
 *   Cau thoai binh thuong.
 *   Cau thoai. || goi y anh cho cau nay
 */

const DIRECTIVE = /^@([a-zA-Z_][\w-]*)\s*[:=]\s*(.*)$/;
const SCENE = /^(?:={2,}\s*(.+?)\s*={2,}|#{2,}\s+(.+?))\s*$/;
const HINT_SEP = /\s*\|\|\s*/;

/** Tach mot doan van dai thanh cac cau ngan vua tam doc. */
export function splitSentences(text, maxChars = 220) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Tach sau dau cau ket thuc, nhung giu lai dau cau o cuoi moi manh.
  const rough = normalized.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) || [normalized];
  const out = [];
  for (const piece of rough.map((s) => s.trim()).filter(Boolean)) {
    if (piece.length <= maxChars) {
      out.push(piece);
      continue;
    }
    // Cau qua dai: tach tiep o dau phay / dau chAm phay / dau gach ngang.
    let buffer = '';
    for (const clause of piece.split(/(?<=[,;:—–])\s+/)) {
      if (!buffer) {
        buffer = clause;
      } else if (`${buffer} ${clause}`.length <= maxChars) {
        buffer = `${buffer} ${clause}`;
      } else {
        out.push(buffer);
        buffer = clause;
      }
    }
    if (buffer) out.push(buffer);
  }
  // Gop cac manh chua thanh cau (khong co dau ket cau) vao manh truoc.
  // Cau hoan chinh luon duoc giu rieng, vi moi cau la mot anh minh hoa —
  // gop chung lai se lam anh lech so voi loi thoai.
  const isFragment = (piece) => !/[.!?…]["'”’)\]]*$/.test(piece);
  const merged = [];
  for (const piece of out) {
    const prev = merged[merged.length - 1];
    if (prev && isFragment(piece) && `${prev} ${piece}`.length <= maxChars) {
      merged[merged.length - 1] = `${prev} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

export function parseScript(raw, { maxChars = 220, splitLongLines = true } = {}) {
  const meta = {};
  const lines = [];
  const scenes = [];
  let sceneIndex = -1;
  let sceneTitle = '';

  const pushScene = (title) => {
    sceneIndex += 1;
    sceneTitle = title;
    scenes.push({ index: sceneIndex, title, lineIds: [] });
  };

  for (const rawLine of String(raw).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') && !SCENE.test(line)) continue;

    const directive = line.match(DIRECTIVE);
    if (directive) {
      meta[directive[1].toLowerCase()] = directive[2].trim();
      continue;
    }

    const scene = line.match(SCENE);
    if (scene) {
      pushScene((scene[1] || scene[2] || '').trim());
      continue;
    }

    const [textPart, hintPart] = line.split(HINT_SEP);
    const text = (textPart || '').trim();
    if (!text) continue;
    const imageHint = (hintPart || '').trim();

    if (sceneIndex < 0) pushScene('');

    const pieces = splitLongLines ? splitSentences(text, maxChars) : [text];
    pieces.forEach((piece, pieceIndex) => {
      const id = `L${String(lines.length + 1).padStart(4, '0')}`;
      lines.push({
        id,
        index: lines.length,
        sceneIndex,
        sceneTitle,
        text: piece,
        // Goi y anh chi gan cho manh dau tien de tranh lap prompt giong nhau.
        imageHint: pieceIndex === 0 ? imageHint : '',
      });
      scenes[sceneIndex].lineIds.push(id);
    });
  }

  if (!lines.length) {
    throw new Error('Kich ban rong: khong tim thay cau thoai nao.');
  }

  return {
    meta,
    scenes,
    lines,
    stats: {
      lineCount: lines.length,
      sceneCount: scenes.length,
      charCount: lines.reduce((sum, l) => sum + l.text.length, 0),
    },
  };
}
