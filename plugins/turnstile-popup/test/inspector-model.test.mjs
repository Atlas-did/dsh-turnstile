// Inspector model: properties are facts, actions are commands, and a disabled action must say why.
import assert from 'node:assert';
import * as capabilities from '../lib/capabilities.js';

// The inspector asks the browser-facing module for capabilities; in Node we hand it the same module.
globalThis.__caps = capabilities;

import { buildInspector } from '../lib/inspector-model.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const data = {
  plugins: [
    { name: 'plug-alpha', version: '1.0.0', disabled: false, rows: ['alpha-row'], ui: ['ui-settings', 'ui-chat'], anchor: 'top-left' },
    { name: 'plug-beta', version: '2.0.0-beta', disabled: true, rows: [], ui: [], anchor: null },
  ],
  surfaces: [
    { surface: 'ui-settings', count: 2, hardcoded: ['plug-alpha'], plugins: [{ name: 'plug-alpha' }, { name: 'plug-beta' }] },
    { surface: 'ui-chat', count: 1, hardcoded: [], plugins: [{ name: 'plug-alpha' }] },
  ],
  report: { checks: [{ name: 'risk', ok: false, ms: 12, findings: [{}, {}] }] },
};

test('no selection yields an empty model, not a crash', () => {
  const m = buildInspector(null, data);
  assert.deepStrictEqual(m.properties, []);
  assert.deepStrictEqual(m.actions, []);
});

test('a plugin selection separates facts from commands', () => {
  const m = buildInspector({ kind: 'plugin', title: 'plug-alpha' }, data);
  assert.strictEqual(m.title, 'plug-alpha');
  assert.strictEqual(m.properties.length, 4);
  assert.deepStrictEqual(m.properties.map((p) => p.label), ['版本', '行 id', 'UI 面', '位置']);
  assert.deepStrictEqual(m.actions.map((a) => a.id), ['toggle', 'anchor', 'locate']);
});

test('an action without a config row is disabled and explains itself', () => {
  const m = buildInspector({ kind: 'plugin', title: 'plug-beta' }, data);
  const toggle = m.actions.find((a) => a.id === 'toggle');
  assert.strictEqual(toggle.enabled, false);
  assert.match(toggle.reason, /没有 profile 行/);
  assert.strictEqual(m.actions.find((a) => a.id === 'locate').enabled, true);
});

test('a stale selection says so instead of inventing data', () => {
  const m = buildInspector({ kind: 'plugin', title: 'gone' }, data);
  assert.match(m.subtitle, /已不在当前清单/);
  assert.deepStrictEqual(m.properties, []);
});

test('a surface with one plugin cannot be fused, and says why', () => {
  const m = buildInspector({ kind: 'surface', title: 'ui-chat' }, data);
  const fuse = m.actions.find((a) => a.id === 'fuse');
  assert.strictEqual(fuse.enabled, false);
  assert.match(fuse.reason, /只有一个插件/);
});

test('a contested surface counts hardcoded plugins', () => {
  const m = buildInspector({ kind: 'surface', title: 'ui-settings' }, data);
  assert.match(m.subtitle, /2 个插件/);
  assert.match(m.subtitle, /1 个硬编码/);
});

test('a check selection reports its finding count', () => {
  const m = buildInspector({ kind: 'check', title: 'risk' }, data);
  assert.strictEqual(m.subtitle, '未通过');
  assert.strictEqual(m.properties.find((p) => p.label === '发现').value, '2');
});

console.log('INSPECTOR_TEST_OK ' + passed + ' checks');
