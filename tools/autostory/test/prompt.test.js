import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, fallbackPrompts } from '../src/prompt/imagePrompts.js';

test('doc JSON boc trong markdown fence', () => {
  const out = extractJson('```json\n[{"id":"L1","prompt":"a"}]\n```');
  assert.deepEqual(out, [{ id: 'L1', prompt: 'a' }]);
});

test('doc JSON lan trong van ban', () => {
  const out = extractJson('Ket qua day: {"style":"oil"} het nhe.');
  assert.deepEqual(out, { style: 'oil' });
});

test('JSON hong thi bao loi ro rang', () => {
  assert.throws(() => extractJson('khong co json o day'), /Khong doc duoc JSON/);
});

test('prompt du phong uu tien goi y anh, kem phong cach', () => {
  const [withHint, withoutHint] = fallbackPrompts(
    [
      { id: 'L1', text: 'cau thoai', imageHint: 'ba cu dan luoi' },
      { id: 'L2', text: 'cau thoai hai', imageHint: '' },
    ],
    { style: 'oil painting' },
  );
  assert.equal(withHint.prompt, 'ba cu dan luoi, oil painting');
  assert.equal(withoutHint.prompt, 'cau thoai hai, oil painting');
  assert.equal(withHint.source, 'fallback');
});
