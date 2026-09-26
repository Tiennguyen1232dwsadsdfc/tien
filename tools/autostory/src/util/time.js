/** CapCut luu moi moc thoi gian bang micro-giay (1e-6 s). */
export const US = 1_000_000;

export const secToUs = (sec) => Math.max(0, Math.round(sec * US));
export const usToSec = (us) => us / US;

export function formatTimecode(sec, fps = 30) {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * fps);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(s)}:${two(f)}`;
}

export function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}
