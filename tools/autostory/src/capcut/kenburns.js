/**
 * Hieu ung Ken Burns (zoom vao / zoom ra / troi trai / troi phai) cho anh tinh.
 *
 * Lam bang KEYFRAME scale + position thay vi goi "animation" san co cua CapCut:
 * animation cua CapCut phu thuoc resource id tai ve tu server ho, con keyframe
 * thi nam ngay trong file draft nen mo may nao cung chay.
 *
 * Don vi: scale 1.0 = anh vua khung. position 1.0 = dich mot nua chieu rong khung.
 * Khi scale = s, anh tran ra moi ben (s-1)/2 chieu rong khung, tuong ung position
 * toi da |x| = s - 1. Vuot qua nguong do se lo vien den, nen moi keyframe deu
 * bi kep trong gioi han cua chinh scale tai thoi diem ay.
 */

const SAFETY = 0.85;

/** Bo sinh so ngau nhien co seed — chay lai cung kich ban se ra cung hieu ung. */
export function seededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const panLimit = (scale) => Math.max(0, (scale - 1) * SAFETY);

/**
 * Tra ve 2 keyframe (dau, cuoi) cho mot move.
 * Moi keyframe: { at: 0|1, scale, x, y }
 */
export function buildMove(move, { zoomMin, zoomMax }) {
  const lo = Math.min(zoomMin, zoomMax);
  const hi = Math.max(zoomMin, zoomMax);
  // Pan can san "le" o ca hai dau -> giu scale khong duoi zoomMin khi co pan.
  const pan = (scale, dir) => dir * panLimit(scale);

  switch (move) {
    case 'zoom-in':
      return [
        { at: 0, scale: 1, x: 0, y: 0 },
        { at: 1, scale: hi, x: 0, y: 0 },
      ];
    case 'zoom-out':
      return [
        { at: 0, scale: hi, x: 0, y: 0 },
        { at: 1, scale: 1, x: 0, y: 0 },
      ];
    case 'pan-left':
      return [
        { at: 0, scale: hi, x: pan(hi, 1), y: 0 },
        { at: 1, scale: hi, x: pan(hi, -1), y: 0 },
      ];
    case 'pan-right':
      return [
        { at: 0, scale: hi, x: pan(hi, -1), y: 0 },
        { at: 1, scale: hi, x: pan(hi, 1), y: 0 },
      ];
    case 'pan-up':
      return [
        { at: 0, scale: hi, x: 0, y: pan(hi, -1) },
        { at: 1, scale: hi, x: 0, y: pan(hi, 1) },
      ];
    case 'pan-down':
      return [
        { at: 0, scale: hi, x: 0, y: pan(hi, 1) },
        { at: 1, scale: hi, x: 0, y: pan(hi, -1) },
      ];
    case 'zoom-in-pan-left':
      return [
        { at: 0, scale: lo, x: pan(lo, 1), y: 0 },
        { at: 1, scale: hi, x: pan(hi, -0.6), y: 0 },
      ];
    case 'zoom-in-pan-right':
      return [
        { at: 0, scale: lo, x: pan(lo, -1), y: 0 },
        { at: 1, scale: hi, x: pan(hi, 0.6), y: 0 },
      ];
    case 'zoom-out-pan-left':
      return [
        { at: 0, scale: hi, x: pan(hi, 0.6), y: 0 },
        { at: 1, scale: lo, x: pan(lo, -1), y: 0 },
      ];
    case 'zoom-out-pan-right':
      return [
        { at: 0, scale: hi, x: pan(hi, -0.6), y: 0 },
        { at: 1, scale: lo, x: pan(lo, 1), y: 0 },
      ];
    case 'none':
      return [{ at: 0, scale: 1, x: 0, y: 0 }];
    default:
      throw new Error(`Hieu ung khong biet: ${move}`);
  }
}

/** Chon move cho tung anh: khong lap lai move truoc do, va on dinh giua cac lan chay. */
export function planMoves(count, { moves, seed }) {
  const pool = moves?.length ? moves : ['zoom-in', 'zoom-out'];
  const rand = seededRandom(seed);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let pick = pool[Math.floor(rand() * pool.length) % pool.length];
    if (pool.length > 1 && pick === out[i - 1]) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    out.push(pick);
  }
  return out;
}

/** Kiem tra mot ke hoach keyframe khong lam lo vien den. */
export function validateMove(keyframes) {
  for (const kf of keyframes) {
    const limit = panLimit(kf.scale) / SAFETY + 1e-9;
    if (Math.abs(kf.x) > limit || Math.abs(kf.y) > limit) {
      return { ok: false, reason: `position ${kf.x},${kf.y} vuot gioi han ${limit.toFixed(3)} o scale ${kf.scale}` };
    }
  }
  return { ok: true };
}
