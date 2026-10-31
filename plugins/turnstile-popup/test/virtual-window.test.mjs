// Virtual window: the slice must always cover the viewport, never exceed the model, and report pad.
import assert from 'node:assert';
import { computeWindow, flattenVisible, createFlatIndex, expandAt, collapseAt, toggleAt, visibleSlice } from '../lib/virtual-window.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

test('the first viewport starts at zero and pads nothing above', () => {
  const w = computeWindow({ total: 1000, scrollTop: 0, rowHeight: 20, viewportHeight: 200, overscan: 0 });
  assert.strictEqual(w.start, 0);
  assert.strictEqual(w.end, 10);
  assert.strictEqual(w.topPad, 0);
  assert.strictEqual(w.bottomPad, (1000 - 10) * 20);
});

test('scrolling moves the window and both pads', () => {
  const w = computeWindow({ total: 1000, scrollTop: 400, rowHeight: 20, viewportHeight: 200, overscan: 0 });
  assert.strictEqual(w.start, 20);
  assert.strictEqual(w.end, 30);
  assert.strictEqual(w.topPad, 400);
});

test('overscan widens the slice on both sides', () => {
  const w = computeWindow({ total: 1000, scrollTop: 400, rowHeight: 20, viewportHeight: 200, overscan: 5 });
  assert.strictEqual(w.start, 15);
  assert.strictEqual(w.end, 35);
});

test('the window never exceeds the model', () => {
  const w = computeWindow({ total: 12, scrollTop: 0, rowHeight: 20, viewportHeight: 600, overscan: 3 });
  assert.strictEqual(w.end, 12);
  assert.strictEqual(w.bottomPad, 0);
});

test('scrolling past the end is clamped and reported', () => {
  const w = computeWindow({ total: 50, scrollTop: 99999, rowHeight: 20, viewportHeight: 200, overscan: 0 });
  assert.ok(w.start >= 50);
  assert.strictEqual(w.end, 50);
  assert.strictEqual(w.bottomPad, 0);
  assert.strictEqual(w.clamped, true);
});

test('an empty or invalid model yields an empty window', () => {
  assert.deepStrictEqual(computeWindow({ total: 0 }), { start: 0, end: 0, topPad: 0, bottomPad: 0, clamped: false });
  assert.deepStrictEqual(computeWindow({ total: NaN }), { start: 0, end: 0, topPad: 0, bottomPad: 0, clamped: false });
});

test('collapsed nodes hide their whole subtree', () => {
  const nodes = [
    { id: 'profile', parent: null },
    { id: 'a', parent: 'profile' },
    { id: 'a1', parent: 'a' },
    { id: 'b', parent: 'profile' },
  ];
  const collapsed = flattenVisible(nodes, { rootId: null, expanded: {} });
  assert.deepStrictEqual(collapsed.map((x) => x.node.id), ['profile']);
  const openProfile = flattenVisible(nodes, { rootId: null, expanded: { profile: true } });
  assert.deepStrictEqual(openProfile.map((x) => x.node.id), ['profile', 'a', 'b']);
  assert.deepStrictEqual(openProfile.map((x) => x.depth), [0, 1, 1]);
});

test('expanding a deep node walks it in order, depth included', () => {
  const nodes = [
    { id: 'profile', parent: null },
    { id: 'a', parent: 'profile' },
    { id: 'a1', parent: 'a' },
  ];
  const rows = flattenVisible(nodes, { expanded: { profile: true, a: true } });
  assert.deepStrictEqual(rows.map((x) => [x.node.id, x.depth]), [['profile', 0], ['a', 1], ['a1', 2]]);
});


// --- 增量扁平索引：展开/折叠只动子树区间 ---
const wide = [{ id: 'root' }, { id: 'big' }];
for (let i = 0; i < 100; i += 1) wide.push({ id: 'leaf-' + i, parent: 'root' });
for (let i = 0; i < 50; i += 1) wide.push({ id: 'big-' + i, parent: 'big' });

let idx = createFlatIndex(wide, { rootId: null, expanded: {} });
test('索引初始只有根层级', () => { assert.ok(idx.flat.length === 2, 'flat=' + idx.flat.length); });

const open1 = expandAt(idx, 'root');
test('展开 root 后多出 100 行', () => { assert.ok(open1.index.flat.length === 102, 'flat=' + open1.index.flat.length); });
test('展开只访问子树（100，不是 152）', () => { assert.ok(open1.stats.walked === 100, 'walked=' + open1.stats.walked); });

const open2 = expandAt(open1.index, 'big');
test('再展开 big 只访问 50 个节点', () => { assert.ok(open2.stats.walked === 50, 'walked=' + open2.stats.walked); });
test('总行数 2 + 100 + 50', () => { assert.ok(open2.index.flat.length === 152, 'flat=' + open2.index.flat.length); });
test('位置索引正确', () => { assert.ok(open2.index.pos.get('big-49') === 151, 'pos=' + open2.index.pos.get('big-49')); });

const closed = collapseAt(open2.index, 'big');
test('折叠只删子树（50 行）', () => { assert.ok(closed.index.flat.length === 102, 'flat=' + closed.index.flat.length); });
test('折叠 walked 等于删掉的行数', () => { assert.ok(closed.stats.walked === 50, 'walked=' + closed.stats.walked); });
test('折叠后 big 在、子节点不在', () => { assert.ok(closed.index.pos.has('big') && !closed.index.pos.has('big-0')); });

const reopened = toggleAt(closed.index, 'big');
const again = toggleAt(toggleAt(reopened.index, 'big').index, 'big');
test('来回切换后顺序稳定', () => { assert.ok(JSON.stringify(again.index.flat.map((r) => r.id)) === JSON.stringify(reopened.index.flat.map((r) => r.id))); });

const slice = visibleSlice(reopened.index, { start: 102, end: 105 });
test('可视区间切片正确', () => { assert.ok(slice.length === 3 && slice[0].id === 'big-0', slice.map((r) => r.id).join(',')); });

console.log('VIRTUALWINDOW_TEST_OK ' + passed + ' checks');