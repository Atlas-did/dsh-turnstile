import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginOperation, settleOperation, listOperations } from '../lib/journal.js';

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const stateRoot = join(root, 'state');
mkdirSync(stateRoot, { recursive: true });
const state = mkdtempSync(join(stateRoot, '.journal-read-'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + ': ' + error.stack); process.exitCode = 1; }
}

try {
  test('an empty journal has an empty public read model', () => {
    assert.deepEqual(listOperations(state), []);
  });
  beginOperation(state, { planId: 'one', kind: 'designer', operationCount: 1 });
  beginOperation(state, { planId: 'two', kind: 'designer', operationCount: 2 });
  settleOperation(state, 'two', 'previewed', { changed: true });

  test('audit entries are newest first and include settled metadata', () => {
    const entries = listOperations(state);
    assert.deepEqual(entries.map((entry) => entry.id), ['two', 'one']);
    assert.equal(entries[0].status, 'previewed');
    assert.deepEqual(entries[0].detail, { changed: true });
  });

  test('limit is bounded and defaults to one for invalid zero-like input', () => {
    assert.equal(listOperations(state, { limit: 1 }).length, 1);
    assert.equal(listOperations(state, { limit: 999 }).length, 2);
    assert.equal(listOperations(state, { limit: 0 }).length, 2);
  });

  test('callers cannot mutate the persisted journal through a result object', () => {
    const entries = listOperations(state);
    entries[0].status = 'tampered';
    assert.equal(listOperations(state)[0].status, 'previewed');
  });
} finally {
  rmSync(state, { recursive: true, force: true });
}
console.log('JOURNALREAD_TEST_OK ' + passed + ' checks');
