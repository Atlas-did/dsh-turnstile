// Transaction discipline tests: every refusal path, and the atomic write itself.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { makePlan, applyPlan, describePlan, releaseLock } from '../lib/txn.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const dir = mkdtempSync(join(tmpdir(), 'txn-'));
const file = join(dir, 'cordis.patch.yml');
writeFileSync(file, 'original\n');

test('plan describes the change without touching the file', () => {
  const p = makePlan({ file, next: 'changed\n', reason: 'test' });
  const d = describePlan(p);
  assert.strictEqual(readFileSync(file, 'utf8'), 'original\n');
  assert.notStrictEqual(d.beforeSha, d.afterSha);
  assert.strictEqual(d.next, undefined);
  assert.ok(d.confirm.startsWith('apply '));
});

test('wrong confirmation is refused', () => {
  const p = makePlan({ file, next: 'changed\n' });
  const r = applyPlan(p, { confirm: 'yes' });
  assert.strictEqual(r.applied, false);
  assert.ok(r.problems.includes('confirmation mismatch'));
  assert.strictEqual(readFileSync(file, 'utf8'), 'original\n');
  releaseLock(file);
});

test('stale precondition is refused after the file changes', () => {
  const p = makePlan({ file, next: 'changed\n' });
  writeFileSync(file, 'edited by someone else\n');
  const r = applyPlan(p, { confirm: p.confirm });
  assert.strictEqual(r.applied, false);
  assert.ok(r.problems.includes('precondition hash changed'));
  assert.strictEqual(readFileSync(file, 'utf8'), 'edited by someone else\n');
  writeFileSync(file, 'original\n');
  releaseLock(file);
});

test('a second apply with the same plan is refused (single use by hash)', () => {
  const p = makePlan({ file, next: 'changed\n' });
  const first = applyPlan(p, { confirm: p.confirm });
  assert.strictEqual(first.applied, true);
  releaseLock(file);
  const second = applyPlan(p, { confirm: p.confirm });
  assert.strictEqual(second.applied, false);
  assert.ok(second.problems.includes('precondition hash changed'));
  writeFileSync(file, 'original\n');
});

test('hold lock blocks a concurrent mutation', () => {
  const p = makePlan({ file, next: 'changed\n' });
  writeFileSync(file + '.lock', 'other');
  const r = applyPlan(p, { confirm: p.confirm });
  assert.strictEqual(r.applied, false);
  assert.ok(r.problems.includes('another mutation holds the lock'));
  rmSync(file + '.lock');
});

test('failed health check rolls the file back', () => {
  const p = makePlan({ file, next: 'broken\n' });
  const r = applyPlan(p, { confirm: p.confirm, healthCheck: () => ({ ok: false, detail: 'yaml unreadable' }) });
  assert.strictEqual(r.applied, false);
  assert.ok(r.problems.includes('health check failed'));
  assert.strictEqual(readFileSync(file, 'utf8'), 'original\n');
  releaseLock(file);
});

test('successful apply writes the exact bytes and keeps a backup', () => {
  const p = makePlan({ file, next: 'original\nsecond\n' });
  const r = applyPlan(p, { confirm: p.confirm, healthCheck: () => ({ ok: true }) });
  assert.strictEqual(r.applied, true);
  assert.strictEqual(readFileSync(file, 'utf8'), 'original\nsecond\n');
  assert.ok(r.backup && existsSync(r.backup));
  assert.strictEqual(readFileSync(r.backup, 'utf8'), 'original\n');
  releaseLock(file);
});

test('no temp or lock files are left behind', () => {
  const leftovers = readdirSync(dir).filter((f) => /\.tmp-|\.lock$/.test(f));
  assert.deepStrictEqual(leftovers, []);
});

rmSync(dir, { recursive: true, force: true });
console.log('TXN_TEST_OK ' + passed + ' checks');
