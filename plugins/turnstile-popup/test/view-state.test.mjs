// View state: fail-closed parsing, atomic write, and the console restoring order after reload.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { readViewState, writeViewState, sanitizeViewState, DEFAULT_VIEW_STATE, viewStatePath } from '../lib/view-state.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const dir = mkdtempSync(join(tmpdir(), 'view-state-'));

test('no file means defaults, and it says so', () => {
  const r = readViewState(dir);
  assert.strictEqual(r.source, 'default');
  assert.deepStrictEqual(r.state, DEFAULT_VIEW_STATE);
});

test('a corrupt file falls back instead of throwing', () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(viewStatePath(dir), '{ this is not json');
  const r = readViewState(dir);
  assert.strictEqual(r.source, 'fallback');
  assert.strictEqual(r.state.sortKey, 'name');
});

test('an array or scalar is not a view state', () => {
  assert.deepStrictEqual(sanitizeViewState([1, 2, 3]), DEFAULT_VIEW_STATE);
  assert.deepStrictEqual(sanitizeViewState('nope'), DEFAULT_VIEW_STATE);
});

test('unknown keys and bad values are dropped, known ones survive', () => {
  const s = sanitizeViewState({ view: 'plugins', sortKey: 'surfaces', sortDir: -1, status: 'disabled', query: 'dsh', evil: '<script>', sortDir2: 99 });
  assert.strictEqual(s.view, 'plugins');
  assert.strictEqual(s.sortKey, 'surfaces');
  assert.strictEqual(s.sortDir, -1);
  assert.strictEqual(s.status, 'disabled');
  assert.strictEqual(s.query, 'dsh');
  assert.strictEqual(s.evil, undefined);
});

test('an unknown view or sort key falls back per field, not wholesale', () => {
  const s = sanitizeViewState({ view: 'bogus', sortKey: 'torrents', status: 'disabled' });
  assert.strictEqual(s.view, 'overview');
  assert.strictEqual(s.sortKey, 'name');
  assert.strictEqual(s.status, 'disabled');
});

test('write is atomic and round-trips', () => {
  const written = writeViewState(dir, { view: 'surfaces', sortKey: 'status', sortDir: -1 });
  assert.strictEqual(written.view, 'surfaces');
  const back = readViewState(dir);
  assert.strictEqual(back.source, 'file');
  assert.strictEqual(back.state.sortKey, 'status');
  assert.strictEqual(back.state.sortDir, -1);
  assert.ok(!readFileSync(viewStatePath(dir), 'utf8').includes('.tmp-'));
});

test('a very long query is rejected, not truncated silently', () => {
  const s = sanitizeViewState({ query: 'x'.repeat(500) });
  assert.strictEqual(s.query, '');
});

rmSync(dir, { recursive: true, force: true });
console.log('VIEWSTATE_TEST_OK ' + passed + ' checks');
