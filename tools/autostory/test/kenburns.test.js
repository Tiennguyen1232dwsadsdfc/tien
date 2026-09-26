import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMove, planMoves, validateMove, seededRandom } from '../src/capcut/kenburns.js';

const opts = { zoomMin: 1.06, zoomMax: 1.22 };
const MOVES = [
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
  'zoom-in-pan-left', 'zoom-in-pan-right', 'zoom-out-pan-left', 'zoom-out-pan-right', 'none',
];

test('moi hieu ung deu khong lo vien den', () => {
  for (const move of MOVES) {
    const kf = buildMove(move, opts);
    const result = validateMove(kf);
    assert.ok(result.ok, `${move}: ${result.reason}`);
  }
});

test('noi suy giua hai keyframe cung khong lo vien', () => {
  for (const move of MOVES) {
    const kf = buildMove(move, opts);
    if (kf.length < 2) continue;
    for (let t = 0; t <= 1; t += 0.05) {
      const scale = kf[0].scale + (kf[1].scale - kf[0].scale) * t;
      const x = kf[0].x + (kf[1].x - kf[0].x) * t;
      const y = kf[0].y + (kf[1].y - kf[0].y) * t;
      assert.ok(Math.abs(x) <= scale - 1 + 1e-9, `${move} lech x tai t=${t}`);
      assert.ok(Math.abs(y) <= scale - 1 + 1e-9, `${move} lech y tai t=${t}`);
    }
  }
});

test('hieu ung la nhau khong chay lien tiep', () => {
  const plan = planMoves(40, { moves: ['zoom-in', 'zoom-out', 'pan-left'], seed: 7 });
  for (let i = 1; i < plan.length; i += 1) {
    assert.notEqual(plan[i], plan[i - 1], `lap lai tai ${i}`);
  }
});

test('cung seed cho ra cung ke hoach', () => {
  const a = planMoves(20, { moves: MOVES, seed: 42 });
  const b = planMoves(20, { moves: MOVES, seed: 42 });
  assert.deepEqual(a, b);
  const c = planMoves(20, { moves: MOVES, seed: 43 });
  assert.notDeepEqual(a, c);
});

test('bo sinh so ngau nhien nam trong [0,1)', () => {
  const rand = seededRandom(123);
  for (let i = 0; i < 500; i += 1) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `gia tri ngoai khoang: ${v}`);
  }
});

test('hieu ung khong ton tai thi bao loi', () => {
  assert.throws(() => buildMove('xoay-lon', opts), /khong biet/);
});
