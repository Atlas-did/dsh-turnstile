// toggleText: disable keeps the block, enable removes only our line, synthesized rows disappear.
import assert from 'node:assert';
import { toggleText } from '../lib/toggle-text.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const original = '- id: alpha-row\n  name: plug-alpha\n  config:\n    anchor: top-left\n\n- id: beta-row\n  name: plug-beta\n';

test('disable keeps every other key and inserts disabled after name', () => {
  const out = toggleText(original, 'alpha-row', true);
  assert.match(out, /- id: alpha-row\n  name: plug-alpha\n  disabled: true\n  config:/);
  assert.match(out, /anchor: top-left/);
});

test('enable removes only the disabled line', () => {
  const disabled = toggleText(original, 'alpha-row', true);
  const back = toggleText(disabled, 'alpha-row', false);
  assert.strictEqual(back.replace(/\n+$/, ''), original.replace(/\n+$/, ''));
});

test('a synthesized row disappears when enabled again', () => {
  const disabled = toggleText(original, 'ghost-row', true);
  assert.match(disabled, /- id: ghost-row\n  disabled: true/);
  const back = toggleText(disabled, 'ghost-row', false);
  assert.ok(back.indexOf('ghost-row') === -1, 'synthesized row must be removed');
  assert.strictEqual(back.replace(/\n+$/, ''), original.replace(/\n+$/, ''));
});

test('disabling an already disabled row is idempotent', () => {
  const once = toggleText(original, 'alpha-row', true);
  const twice = toggleText(once, 'alpha-row', true);
  assert.strictEqual(twice, once);
});

test('enabling a row that never existed changes nothing', () => {
  const out = toggleText(original, 'nope', false);
  assert.strictEqual(out.replace(/\n+$/, ''), original.replace(/\n+$/, ''));
});

test('an empty patch sentinel is replaced by the first row', () => {
  const out = toggleText('[]\n', 'alpha-row', true);
  assert.match(out, /^- id: alpha-row\n  disabled: true/m);
  assert.ok(out.indexOf('[]') === -1);
});

console.log('TOGGLETEXT_TEST_OK ' + passed + ' checks');
