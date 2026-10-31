// Health scan: every warning or failure must name the next step; credentials only expose key names.
import assert from 'node:assert';
import { credentialsItem, bridgeItem, pluginItem, engineItem, authItem, summarize } from '../lib/health.js';

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('missing credentials warn and name the key', () => {
  const r = credentialsItem({ exists: true, keys: ['deepseek-api-key'] });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.message, /agnes-api-key/);
  assert.ok(r.next.length > 0);
});

test('no credential file is a failure with a fix', () => {
  const r = credentialsItem({ exists: false });
  assert.strictEqual(r.level, 'fail');
  assert.match(r.next, /登录/);
});

test('a missing bridge endpoint reproduces the AA symptom', () => {
  const r = bridgeItem({ exists: false });
  assert.strictEqual(r.level, 'fail');
  assert.match(r.message, /等待本地 bridge/);
  assert.match(r.next, /dsh-bridge-next/);
});

test('a stale endpoint is a warning, not a failure', () => {
  const r = bridgeItem({ exists: true, mtimeMs: 0, now: 3600000 });
  assert.strictEqual(r.level, 'warn');
});

test('installed-but-disabled is a warning with the enable hint', () => {
  const r = pluginItem({ name: 'dsh-free-search', installed: true, disabled: true });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.next, /--enable/);
});

test('engine skips are reported by name', () => {
  assert.strictEqual(engineItem({ skipped: [] }).level, 'pass');
  const r = engineItem({ skipped: ['dsh-talk@0.3.15'], runtime: '0.2.1-rc.3' });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.message, /dsh-talk/);
});

test('an unreadable auth count is skip, not pass', () => {
  assert.strictEqual(authItem({ total: null }).level, 'skip');
  assert.strictEqual(authItem({ total: 70 }).level, 'fail');
  assert.strictEqual(authItem({ total: 3 }).level, 'pass');
});

test('the summary counts levels', () => {
  const s = summarize([{ level: 'pass' }, { level: 'warn' }, { level: 'fail' }, { level: 'skip' }]);
  assert.deepStrictEqual(s, { pass: 1, warn: 1, fail: 1, skip: 1, total: 4 });
});

console.log('HEALTH_TEST_OK ' + passed + ' checks');
