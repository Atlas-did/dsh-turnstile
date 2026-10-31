// preinstall：装之前先看现状。今天最大的错就是跳过这一步。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'preinstall.mjs');
let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

function profile(bundles, deps) {
  const dir = mkdtempSync(join(tmpdir(), 'prei-'));
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: deps || {}, dsh: { profile: { bundles } } }));
  return dir;
}
const run = (dir, pkg) => {
  try { return { code: 0, out: execFileSync(process.execPath, [tool, dir, pkg, '--json'], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
};

test('已经装了同一个包 → check-first', () => {
  const dir = profile(['dsh-free-search'], {});
  const r = run(dir, 'dsh-free-search');
  const j = JSON.parse(r.out);
  assert.strictEqual(r.code, 1);
  assert.strictEqual(j.verdict, 'check-first');
});

test('同族命名（dsh-market vs dshmarket）必须被判为重复', () => {
  const dir = profile(['dshmarket'], {});
  const j = JSON.parse(run(dir, '@ace-zone/dsh-market').out);
  assert.ok(j.siblings.includes('dshmarket'), JSON.stringify(j.siblings));
  assert.strictEqual(j.verdict, 'check-first');
});

test('第二个市场要单独提醒', () => {
  const dir = profile(['dshmarket'], {});
  const j = JSON.parse(run(dir, 'dsh-plugin-market').out);
  assert.ok(j.findings.some((f) => /已经有插件市场/.test(f.text)), JSON.stringify(j.findings));
});

test('干净的 profile + 全新包 → clear 且退出 0', () => {
  const dir = profile(['dsh-free-search'], {});
  const r = run(dir, '@someone/brand-new-plugin');
  assert.strictEqual(r.code, 0);
  assert.strictEqual(JSON.parse(r.out).verdict, 'clear');
});

test('git 依赖要透传给使用者', () => {
  const dir = profile([], { weird: 'git+https://x/y.git#abc' });
  const j = JSON.parse(run(dir, 'newpkg').out);
  assert.ok(j.findings.some((f) => /git 依赖/.test(f.text)));
});

console.log('PREINSTALL_TEST_OK ' + passed + ' checks');
