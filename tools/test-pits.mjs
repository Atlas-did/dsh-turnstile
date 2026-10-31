// 三个坑的检查：每条都要有「能判红」的夹具，否则等于没写。
import assert from 'node:assert';
import { duplicateMarkets, gitDependencies, checkClientSource, clientBundles, runPitChecks } from './pits.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('两个市场 → warn，并点名', () => {
  const r = duplicateMarkets([{ name: 'dshmarket' }, { name: '@ace-zone/dsh-market' }]);
  assert.strictEqual(r.level, 'warn');
  assert.match(r.message, /dshmarket/);
  assert.ok(r.next.length > 0);
});

test('只有一个市场 → pass', () => {
  assert.strictEqual(duplicateMarkets([{ name: 'dshmarket' }, { name: 'dsh-free-search' }]).level, 'pass');
});

test('git 依赖 → warn，并给本地化修法', () => {
  const r = gitDependencies({ 'math-research-dsh': 'git+https://github.com/x/y.git#abc' });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.next, /vendor/);
});

test('普通语义化版本依赖 → pass', () => {
  assert.strictEqual(gitDependencies({ react: '^18.3.1', local: 'file:./vendor/x.tgz' }).level, 'pass');
});

test('坏 client bundle（多余的 }）能被抓出来', () => {
  const bad = checkClientSource('export function mount(ctx) { ctx.ok = true; } }');
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.error.length > 0);
});

test('正常 client bundle 通过', () => {
  assert.strictEqual(checkClientSource('export function mount(ctx) { ctx.ok = true; }').ok, true);
  assert.strictEqual(checkClientSource('export default function () {}').ok, true);
});

test('目录扫描：一个坏包 + 一个好包 → fail 且点名坏的那个', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pits-'));
  mkdirSync(join(dir, 'node_modules', 'good', 'lib'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'bad', 'lib'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'good', 'lib', 'client.js'), 'export function a() {}');
  writeFileSync(join(dir, 'node_modules', 'bad', 'lib', 'client.js'), 'export function a() {} }');
  const r = clientBundles(dir);
  assert.strictEqual(r.level, 'fail');
  assert.match(r.message, /bad/);
});

test('runPitChecks 在假 profile 上返回三条', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pits2-'));
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { a: 'git+https://x/y' }, dsh: { profile: { bundles: ['dshmarket', 'dsh-market'] } } }));
  const rs = runPitChecks(dir);
  assert.strictEqual(rs.length, 3);
  assert.strictEqual(rs[0].level, 'warn');
  assert.strictEqual(rs[1].level, 'warn');
});

console.log('PITS_TEST_OK ' + passed + ' checks');
