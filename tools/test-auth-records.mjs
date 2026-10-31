// auth-records: counting, the limit and pruning must be provable without a real desktop profile.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'auth-records.mjs');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

function makeStore(count) {
  const dir = mkdtempSync(join(tmpdir(), 'authfix-'));
  const file = join(dir, 'Cookies');
  const db = new DatabaseSync(file);
  db.exec('create table cookies (host_key text, name text, value text, expires_utc integer)');
  const insert = db.prepare('insert into cookies (host_key, name, value, expires_utc) values (?,?,?,?)');
  for (let i = 0; i < count; i++) insert.run('127.0.0.1:' + (7000 + i), 'dsh-auth', 'x', 1);
  insert.run('example.com', 'other', 'y', 1);
  db.close();
  return file;
}

const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
};

test('a small store is within the limit', () => {
  const file = makeStore(3);
  const r = run(['--store', file, '--json']);
  const j = JSON.parse(r.out);
  assert.strictEqual(j.total, 3);
  assert.strictEqual(j.over, false);
  assert.strictEqual(r.code, 0);
});

test('a store over the limit exits 1 and says so', () => {
  const file = makeStore(70);
  const r = run(['--store', file, '--json']);
  const j = JSON.parse(r.out);
  assert.strictEqual(j.total, 70);
  assert.strictEqual(j.over, true);
  assert.strictEqual(r.code, 1);
});

test('records are grouped by port and other hosts are ignored', () => {
  const file = makeStore(4);
  const j = JSON.parse(run(['--store', file, '--json']).out);
  assert.strictEqual(Object.keys(j.ports).length, 4);
  assert.strictEqual(j.total, 4);
});

test('--prune removes only local records, keeps a backup, and clears the warning', () => {
  const file = makeStore(70);
  const r = run(['--store', file, '--json', '--prune']);
  const j = JSON.parse(r.out);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(j.total, 0);
  assert.strictEqual(j.over, false);
  assert.ok(j.stores[0].pruned >= 70, String(j.stores[0].pruned));
  assert.ok(existsSync(j.stores[0].backup));
  const db = new DatabaseSync(file, { readOnly: true });
  const left = db.prepare('select count(*) as n from cookies').get().n;
  db.close();
  assert.strictEqual(left, 1, 'the non-local cookie must survive');
  assert.strictEqual(readdirSync(dirname(file)).filter((f) => f.includes('.bak-')).length, 1);
});

console.log('AUTHREC_TEST_OK ' + passed + ' checks');
