// Selection: ctrl toggles, shift extends from the anchor, batch reads report mixed values.
import assert from 'node:assert';
import { EMPTY, select, commonValue, batchToggle, describe } from '../lib/selection.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const order = ['a', 'b', 'c', 'd'];

test('a plain click replaces the selection', () => {
  const s = select({ ids: ['a', 'b'], anchor: 'b' }, 'c', { order });
  assert.deepStrictEqual(s.ids, ['c']);
  assert.strictEqual(s.anchor, 'c');
});

test('ctrl adds and removes without clearing the rest', () => {
  const s1 = select(EMPTY, 'a', { ctrl: true, order });
  const s2 = select(s1, 'c', { ctrl: true, order });
  assert.deepStrictEqual(s2.ids, ['a', 'c']);
  const s3 = select(s2, 'a', { ctrl: true, order });
  assert.deepStrictEqual(s3.ids, ['c']);
});

test('shift extends from the anchor in table order', () => {
  const s1 = select(EMPTY, 'b', { order });
  const s2 = select(s1, 'd', { shift: true, order });
  assert.deepStrictEqual(s2.ids, ['b', 'c', 'd']);
  const s3 = select(s2, 'a', { shift: true, order });
  assert.deepStrictEqual(s3.ids, ['a', 'b']);
});

test('shift without an anchor behaves like a plain click', () => {
  const s = select(EMPTY, 'c', { shift: true, order });
  assert.deepStrictEqual(s.ids, ['c']);
});

test('common value is reported as mixed when rows disagree', () => {
  assert.deepStrictEqual(commonValue([{ disabled: true }, { disabled: true }], 'disabled'), { value: true, mixed: false });
  assert.deepStrictEqual(commonValue([{ disabled: true }, { disabled: false }], 'disabled'), { value: undefined, mixed: true });
  assert.deepStrictEqual(commonValue([], 'disabled'), { value: undefined, mixed: false });
});

test('a batch toggle skips row-less plugins with a reason', () => {
  const out = batchToggle([{ name: 'a', rows: [{}] }, { name: 'b', rows: [] }, null], true);
  assert.deepStrictEqual(out.ops, [{ type: 'toggle', package: 'a', disable: true }]);
  assert.deepStrictEqual(out.skipped, [{ name: 'b', reason: '该插件没有 profile 行' }]);
});

test('the summary says when the selection disagrees', () => {
  const rows = [{ name: 'a', disabled: true }, { name: 'b', disabled: false }];
  assert.strictEqual(describe({ ids: ['a', 'b'], anchor: 'b' }, rows), '已选 2 个 · 停用状态不一致');
  assert.strictEqual(describe({ ids: ['a'], anchor: 'a' }, rows), '已选 1 个');
  assert.strictEqual(describe(EMPTY, rows), '未选中');
});

console.log('SELECTION_TEST_OK ' + passed + ' checks');
