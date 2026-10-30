// Virtual window: the slice must always cover the viewport, never exceed the model, and report pad.
import assert from 'node:assert';
import { computeWindow, flattenVisible } from '../lib/virtual-window.js';

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

console.log('VIRTUALWINDOW_TEST_OK ' + passed + ' checks');
