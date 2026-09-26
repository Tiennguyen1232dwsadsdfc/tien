import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, splitSentences } from '../src/script/parse.js';

test('doc directive, canh va goi y anh', () => {
  const p = parseScript(`# ghi chu
@title: Test
@style: oil painting
== Canh mot ==
Cau mot. || goi y anh
Cau hai.
== Canh hai ==
Cau ba.`);
  assert.equal(p.meta.title, 'Test');
  assert.equal(p.meta.style, 'oil painting');
  assert.equal(p.stats.sceneCount, 2);
  assert.equal(p.stats.lineCount, 3);
  assert.equal(p.lines[0].imageHint, 'goi y anh');
  assert.equal(p.lines[2].sceneTitle, 'Canh hai');
});

test('tach doan dai thanh nhieu cau', () => {
  const long = 'Cau mot rat dai. Cau hai cung dai. Cau ba nua.';
  const p = parseScript(long);
  assert.equal(p.stats.lineCount, 3);
  assert.equal(p.lines[0].text, 'Cau mot rat dai.');
});

test('cau vuot maxChars duoc tach o dau phay', () => {
  const text = `${'a'.repeat(60)}, ${'b'.repeat(60)}, ${'c'.repeat(60)}.`;
  const pieces = splitSentences(text, 80);
  assert.ok(pieces.length >= 2);
  for (const piece of pieces) assert.ok(piece.length <= 130, `qua dai: ${piece.length}`);
});

test('goi y anh chi gan cho manh dau tien', () => {
  const p = parseScript('Cau mot. Cau hai. || goi y');
  assert.equal(p.lines[0].imageHint, 'goi y');
  assert.equal(p.lines[1].imageHint, '');
});

test('kich ban rong thi bao loi', () => {
  assert.throws(() => parseScript('# chi co ghi chu\n\n'), /rong/);
});
