const COLORS = { gray: 90, red: 31, green: 32, yellow: 33, blue: 34, cyan: 36 };
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function paint(color, text) {
  if (!useColor) return text;
  return `\u001b[${COLORS[color]}m${text}\u001b[0m`;
}

export const log = {
  info: (...a) => console.log(paint('cyan', '›'), ...a),
  step: (...a) => console.log(paint('blue', '▸'), ...a),
  ok: (...a) => console.log(paint('green', '✓'), ...a),
  warn: (...a) => console.warn(paint('yellow', '!'), ...a),
  error: (...a) => console.error(paint('red', '✗'), ...a),
  dim: (...a) => console.log(paint('gray', a.join(' '))),
};

/** Thanh tien do mot dong, dung cho vong lap dai (TTS / sinh anh). */
export function progress(label, total) {
  let done = 0;
  const render = () => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const width = 24;
    const filled = Math.round((width * done) / (total || 1));
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const line = `${paint('blue', '▸')} ${label} ${bar} ${done}/${total} (${pct}%)`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
  };
  render();
  return {
    tick(n = 1) {
      done += n;
      render();
    },
    done() {
      if (process.stdout.isTTY) process.stdout.write('\n');
      else console.log(`${label}: ${done}/${total}`);
    },
  };
}
