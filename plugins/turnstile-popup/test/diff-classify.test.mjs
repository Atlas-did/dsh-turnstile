// classifyDiff: counts and markers must match the texts, and a huge pair must refuse politely.
import assert from 'node:assert';
import { classifyDiff, CHANGE, KIND, is } from '../lib/diff-state.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const before = '- id: alpha-row\n  name: plug-alpha\n';
const after = '- id: alpha-row\n  name: plug-alpha\n  disabled: true\n';

test('an added line is counted and marked +', () => {
  const d = classifyDiff(before, after);
  assert.strictEqual(d.summary.added, 1);
  assert.strictEqual(d.summary.removed, 0);
  assert.strictEqual(d.lines.find((l) => l.marker === '+').text, '  disabled: true');
});

test('a removed line is counted and marked -', () => {
  const d = classifyDiff(after, before);
  assert.strictEqual(d.summary.removed, 1);
  assert.strictEqual(d.summary.added, 0);
});

test('identical texts produce only unchanged lines', () => {
  const d = classifyDiff(before, before);
  assert.strictEqual(d.summary.added, 0);
  assert.strictEqual(d.summary.removed, 0);
  assert.ok(d.summary.same > 0);
});

test('row lines are classified as ROW, indented config as CONFIG', () => {
  const d = classifyDiff('- id: x\n  disabled: true\n', '- id: x\n  disabled: false\n');
  const row = d.lines.find((l) => l.text === '- id: x');
  const cfg = d.lines.find((l) => l.text.indexOf('disabled') !== -1);
  assert.ok(is(row.code, KIND, KIND.ROW));
  assert.ok(is(cfg.code, KIND, KIND.CONFIG));
});

test('every changed line carries a change code, unchanged lines do not', () => {
  const d = classifyDiff(before, after);
  for (const l of d.lines) {
    const changed = is(l.code, CHANGE, CHANGE.ADDED) || is(l.code, CHANGE, CHANGE.REMOVED);
    assert.strictEqual(changed, l.marker === '+' || l.marker === '-');
  }
});

test('a huge pair is refused instead of hanging', () => {
  const big = 'x\n'.repeat(500);
  const d = classifyDiff(big, big, 1000);
  assert.strictEqual(d.tooBig, true);
  assert.deepStrictEqual(d.lines, []);
});

test('empty inputs do not throw', () => {
  const d = classifyDiff('', '');
  assert.strictEqual(d.tooBig, false);
  assert.ok(d.summary.same >= 1);
});

console.log('DIFFCLASSIFY_TEST_OK ' + passed + ' checks');
