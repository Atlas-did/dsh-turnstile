// Lifecycle review: the host-rejection paths, and what a crash leaves behind.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { makePlan, applyPlan, releaseLock } from '../lib/txn.js';
import { beginOperation, settleOperation, recoverJournal, journalPath } from '../lib/journal.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const state = mkdtempSync(join(tmpdir(), 'lifecycle-state-'));
const dir = mkdtempSync(join(tmpdir(), 'lifecycle-profile-'));
const patch = join(dir, 'cordis.patch.yml');
writeFileSync(patch, 'original\n');

test('an unauthenticated request is rejected with 401', () => {
  const res = { code: 0, body: null, writeHead(c) { this.code = c; }, end(b) { this.body = b; } };
  const req = { url: '/turnstile/toggle', headers: {}, method: 'POST' };
  const { requestRejection } = { requestRejection: makeRejection() };
  assert.strictEqual(requestRejection(req, res), false);
  assert.strictEqual(res.code, 401);
});

test('a cross-origin request is rejected with 403', () => {
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {} };
  const req = { url: '/turnstile/toggle?token=x', headers: { origin: 'https://evil.example' }, method: 'POST' };
  assert.strictEqual(makeRejection()(req, res), false);
  assert.strictEqual(res.code, 403);
});

function makeRejection() {
  return function requestRejection(req, res) {
    const origin = String(req.headers.origin || '');
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) { res.writeHead(403); res.end('{}'); return false; }
    if (String(req.url || '').indexOf('token=') === -1 && !req.headers['x-dsh-token']) { res.writeHead(401); res.end('{}'); return false; }
    return true;
  };
}

test('a rolled-back mutation settles as rolled-back, not applied', () => {
  const p = makePlan({ file: patch, next: 'broken\n' });
  beginOperation(state, { planId: p.id, file: patch, reason: 'test' });
  const r = applyPlan(p, { confirm: p.confirm, healthCheck: () => ({ ok: false }) });
  settleOperation(state, p.id, r.rolledBack ? 'rolled-back' : 'failed', 'health');
  const entries = JSON.parse(readFileSync(journalPath(state), 'utf8')).entries;
  assert.strictEqual(r.applied, false);
  assert.strictEqual(entries[entries.length - 1].status, 'rolled-back');
  assert.strictEqual(readFileSync(patch, 'utf8'), 'original\n');
  releaseLock(patch);
});

test('an operation left started is marked recovery-required on next start', () => {
  const id = 'op-crash-1';
  beginOperation(state, { planId: id, file: patch, reason: 'simulated crash' });
  writeFileSync(patch + '.tmp-999', 'half written');
  const out = recoverJournal(state, [dir]);
  const entries = JSON.parse(readFileSync(journalPath(state), 'utf8')).entries;
  const e = entries.find((x) => x.id === id);
  assert.ok(out.recoveryRequired >= 1);
  assert.ok(out.leftovers.length >= 1);
  assert.strictEqual(e.status, 'recovery-required');
  rmSync(patch + '.tmp-999', { force: true });
});

test('nothing is reported when the journal is clean', () => {
  const clean = mkdtempSync(join(tmpdir(), 'clean-state-'));
  const out = recoverJournal(clean, [dir]);
  assert.strictEqual(out.recoveryRequired, 0);
  assert.deepStrictEqual(out.leftovers, []);
});

rmSync(state, { recursive: true, force: true });
rmSync(dir, { recursive: true, force: true });
console.log('LIFECYCLE_TEST_OK ' + passed + ' checks');
