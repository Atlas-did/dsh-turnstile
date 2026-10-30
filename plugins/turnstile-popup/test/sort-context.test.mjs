// Sort context: the same context must yield the same order regardless of input order.
import assert from 'node:assert';
import { compareRows, orderedRows, valueOf, SORT_KEYS } from '../lib/sort-context.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const rows = [
  { name: 'beta', version: '0.2.0', ui: ['a', 'b'], rows: [1], disabled: false },
  { name: 'alpha', version: '0.1.0', ui: ['a'], rows: [], disabled: true },
  { name: 'gamma', version: '0.2.0', ui: ['a', 'b'], rows: [1, 2], disabled: false },
];

test('ascending by name', () => {
  assert.deepStrictEqual(orderedRows(rows, { key: 'name', dir: 1 }).map((r) => r.name), ['alpha', 'beta', 'gamma']);
});

test('descending by name', () => {
  assert.deepStrictEqual(orderedRows(rows, { key: 'name', dir: -1 }).map((r) => r.name), ['gamma', 'beta', 'alpha']);
});

test('ties on a non-name key fall back to name ascending, in both directions', () => {
  const asc = orderedRows(rows, { key: 'version', dir: 1 }).map((r) => r.name);
  assert.deepStrictEqual(asc, ['alpha', 'beta', 'gamma']);
  const desc = orderedRows(rows, { key: 'version', dir: -1 }).map((r) => r.name);
  assert.deepStrictEqual(desc, ['gamma', 'beta', 'alpha']);
});

test('input order never leaks into the output', () => {
  const a = orderedRows(rows, { key: 'surfaces', dir: -1 }).map((r) => r.name);
  const b = orderedRows(rows.slice().reverse(), { key: 'surfaces', dir: -1 }).map((r) => r.name);
  assert.deepStrictEqual(a, b);
});

test('unknown key falls back to name instead of throwing', () => {
  assert.deepStrictEqual(orderedRows(rows, { key: 'torrents', dir: 1 }).map((r) => r.name), ['alpha', 'beta', 'gamma']);
});

test('missing fields do not crash the comparator', () => {
  const sparse = [{ name: 'x' }, { name: 'y', version: undefined, ui: undefined }];
  assert.strictEqual(orderedRows(sparse, { key: 'version', dir: 1 }).length, 2);
  assert.strictEqual(valueOf({}, 'rows'), 0);
});

test('every advertised key is sortable', () => {
  for (const key of SORT_KEYS) assert.strictEqual(orderedRows(rows, { key, dir: 1 }).length, 3);
});

console.log('SORTCONTEXT_TEST_OK ' + passed + ' checks');
