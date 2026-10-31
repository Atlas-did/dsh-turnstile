// S1+S2 的验收测试：只认 corpus，不认自写日志。
import assert from 'node:assert';
import { readRecords, readManifest, toUtcIso } from '../tools/lib/records.mjs';
import { aggregate, classify } from '../tools/lib/classify.mjs';
import { mkdtempSync, copyFileSync, appendFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '..', 'tests', 'corpus', '2026-10-31');
const man = readManifest(base);
const filesOf = (d) => readdirSync(join(base, 'logs', d)).filter((f) => f.endsWith('.jsonl')).map((f) => join(base, 'logs', d, f));

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('aa corpus reads 9225 unique records', () => {
  const r = readRecords(filesOf('aa'), { manifest: man });
  assert.strictEqual(r.records.length, 9225);
  assert.strictEqual(r.drift.length, 0);
});

test('control corpus reads 1014 with zero errors', () => {
  const r = readRecords(filesOf('control'), { manifest: man });
  assert.strictEqual(r.records.length, 1014);
  assert.strictEqual(r.records.filter((x) => x.level === 'error').length, 0);
});

test('aa + control dedupes the 1014 duplicated seqs', () => {
  const r = readRecords([...filesOf('aa'), ...filesOf('control')], { manifest: man });
  assert.strictEqual(r.records.length, 9225);
  assert.strictEqual(r.duplicates, 1014);
});

test('a tampered byte is reported as drift', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'drift-'));
  const dst = join(tmp, 'healthy-window-0814.jsonl');
  copyFileSync(filesOf('control')[0], dst);
  assert.strictEqual(readRecords([dst], { manifest: man }).drift.length, 0);
  appendFileSync(dst, '\n');
  const bad = readRecords([dst], { manifest: man });
  assert.strictEqual(bad.drift.length, 1);
  assert.strictEqual(bad.drift[0].why, 'sha256 mismatch');
});

test('timestamps are normalised to UTC', () => {
  assert.strictEqual(toUtcIso('2026-10-31T16:14:00+08:00'), '2026-10-31T08:14:00.000Z');
  assert.strictEqual(toUtcIso('2026-10-31T08:14:00Z'), '2026-10-31T08:14:00.000Z');
  assert.strictEqual(toUtcIso('not a date'), null);
});

test('channel counts match the labelled corpus', () => {
  const A = readRecords(filesOf('aa'), { manifest: man }).records;
  const ch = Object.fromEntries(aggregate(A).map((c) => [c.id, c]));
  assert.strictEqual(ch.codex.verdict, 'failing');
  assert.strictEqual(ch.codex.counts.failures, 236);
  assert.strictEqual(ch.dsh.counts.failures, 92);
  // ingest 通道有两个失败信号：上传失败 124（72 warn + 8+8+40 含 snapshot/auth）+ 同步中断 49
  assert.strictEqual(ch.ingest.counts.failures, 173);
  assert.deepStrictEqual(ch.ingest.counts.signals, { 'ingest-failed': 124, 'sync-interrupted': 49 });
  assert.strictEqual(ch.ingest.counts.bySeverity.warning + ch.ingest.counts.bySeverity.error, 173);
});

test('the healthy window yields no failing channel', () => {
  const C = readRecords(filesOf('control'), { manifest: man }).records;
  const ch = aggregate(C);
  assert.ok(ch.every((c) => c.verdict === 'healthy'), JSON.stringify(ch.map((c) => [c.id, c.verdict])));
});

test('severity and failure are independent', () => {
  const warn = classify({ level: 'warning', message: 'backend ingest request failed: ' });
  assert.strictEqual(warn.signal, 'ingest-failed');
  assert.strictEqual(warn.severity, 'warning');
  const noise = classify({ level: 'error', message: 'session.visibility_read.failed' });
  assert.strictEqual(noise.signal, null);
});

test('as-of mode reports undetermined before the first record', () => {
  const A = readRecords(filesOf('aa'), { manifest: man }).records;
  const ch = aggregate(A, { mode: 'as-of', asOf: '2000-01-01T00:00:00Z' });
  assert.ok(ch.every((c) => c.verdict === 'undetermined'));
});

console.log('RECORDS_TEST_OK ' + passed + ' checks');
