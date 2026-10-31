// Setup checks: each verdict carries a next step, and only key NAMES leave the credentials check.
import assert from 'node:assert';
import { checkBridge, checkCredentials, checkPluginEnabled, summarize } from './setup-checks.mjs';

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('a missing endpoint.json explains the AA symptom and the fix', () => {
  const r = checkBridge({ path: 'p', exists: false });
  assert.strictEqual(r.level, 'fail');
  assert.match(r.message, /等待本地 bridge/);
  assert.match(r.next, /dsh-bridge-next/);
});

test('a stale endpoint warns without claiming failure', () => {
  const r = checkBridge({ path: 'p', exists: true, mtimeMs: 0, now: 3600 * 1000 });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.message, /分钟没更新/);
});

test('a fresh endpoint passes', () => {
  const r = checkBridge({ path: 'p', exists: true, mtimeMs: 1000, now: 2000 });
  assert.strictEqual(r.level, 'pass');
});

test('missing credentials name the key but never a value', () => {
  const r = checkCredentials({ exists: true, keys: ['deepseek-api-key'] });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.message, /agnes-api-key/);
  assert.strictEqual(Object.keys(r).sort().join(','), 'id,level,message,next');
});

test('all keys present passes; a missing file fails', () => {
  assert.strictEqual(checkCredentials({ exists: true, keys: ['agnes-api-key'] }).level, 'pass');
  assert.strictEqual(checkCredentials({ exists: false }).level, 'fail');
});

test('installed-but-disabled is a warn with the enable command', () => {
  const r = checkPluginEnabled({ name: 'dsh-free-search', installed: true, disabled: true });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.next, /--enable/);
  assert.strictEqual(checkPluginEnabled({ name: 'x', installed: false }).level, 'fail');
  assert.strictEqual(checkPluginEnabled({ name: 'x', installed: true, disabled: false }).level, 'pass');
});

test('every non-pass verdict has a next step', () => {
  const rs = [
    checkBridge({ path: 'p', exists: false }),
    checkCredentials({ exists: true, keys: [] }),
    checkPluginEnabled({ name: 'x', installed: true, disabled: true }),
  ];
  for (const r of rs) assert.ok(r.next && r.next.length > 0, r.id + ' must suggest something');
});

test('the summary counts levels', () => {
  const s = summarize([{ level: 'pass' }, { level: 'warn' }, { level: 'fail' }, { level: 'skip' }]);
  assert.deepStrictEqual(s, { pass: 1, warn: 1, fail: 1, skip: 1, total: 4 });
});

console.log('SETUPCHECKS_TEST_OK ' + passed + ' checks');
