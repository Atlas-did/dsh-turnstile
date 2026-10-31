// diagnose 的验收：A/B/C/D/E 五个用例，全部对 corpus 或纯函数，不依赖网络。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { tlsErrorIsMethodProblem } from '../tools/lib/probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const corpus = join(root, 'tests', 'corpus', '2026-10-31');
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(root, 'tools', 'diagnose.mjs'), ...args], { encoding: 'utf8', cwd: root }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
};
const json = (args) => { const r = run([...args, '--json']); return { code: r.code, data: JSON.parse(r.out.slice(r.out.indexOf('{'))) }; };

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('A 双故障：codex 与 dsh 同时 failing，互不掩盖', () => {
  const { code, data } = json(['--corpus', corpus]);
  const ch = Object.fromEntries(data.channels.map((c) => [c.id, c]));
  assert.strictEqual(code, 1);
  assert.strictEqual(ch.codex.verdict, 'failing');
  assert.strictEqual(ch.dsh.verdict, 'failing');
  assert.strictEqual(ch.codex.counts.failures, 236);
  assert.strictEqual(ch.dsh.counts.failures, 92);
});

test('C 健康对照：只读 control 时必须全部 healthy 且退出 0', () => {
  const { code, data } = json(['--corpus', corpus, '--only', 'control']);
  assert.strictEqual(data.verdict, 'healthy');
  assert.strictEqual(code, 0);
  assert.ok(data.channels.every((c) => c.verdict === 'healthy'));
});

test('D 判不出：as-of 早于首条记录 → undetermined', () => {
  const { data } = json(['--corpus', corpus, '--as-of', '2000-01-01T00:00:00Z']);
  assert.strictEqual(data.verdict, 'undetermined');
});

test('E 语料漂移：改一个字节 → exit 4 且拒绝给结论', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'drift-'))
  cpSync(corpus, join(tmp, 'c'), { recursive: true });
  appendFileSync(join(tmp, 'c', 'logs', 'control', 'healthy-window-0814.jsonl'), '\n');
  const { code, data } = json(['--corpus', join(tmp, 'c'), '--only', 'control']);
  assert.strictEqual(code, 4);
  assert.strictEqual(data.verdict, 'corpus-drift');
});

test('B 探测方法错误：有 CA 却未加载 → 判方法问题，不判环境故障', () => {
  const ca = join(root, 'tests', 'fixtures', 'fake-ca.pem');
  const err = Object.assign(new Error('self signed certificate in certificate chain'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' });
  assert.strictEqual(tlsErrorIsMethodProblem(err, ca), true);
  assert.strictEqual(tlsErrorIsMethodProblem(err, null), false);
  assert.strictEqual(tlsErrorIsMethodProblem(new Error('ECONNREFUSED'), ca), false);
});

test('每条结论都带证据与推翻条件', () => {
  const { data } = json(['--corpus', corpus]);
  for (const c of data.channels) {
    assert.ok(c.falsifier && c.falsifier.length > 5, c.id + ' 缺 falsifier');
    if (c.verdict === 'failing') assert.ok(c.evidence.length > 0, c.id + ' 缺证据');
  }
});

console.log('DIAGNOSE_TEST_OK ' + passed + ' checks');
