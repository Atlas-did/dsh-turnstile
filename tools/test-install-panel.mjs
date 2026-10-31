// B13/B14：装面板不能让 profile 起不来，也不能过不了自己的门禁。
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { installPanel } from './install-panel.mjs';
import { loadYaml } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

function freshProfile(patchText) {
  const dir = mkdtempSync(join(tmpdir(), 'panel-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }));
  writeFileSync(join(dir, 'cordis.patch.yml'), patchText);
  return dir;
}

test('模板默认 [] 的 profile：装完仍然可解析（B13 的原始现象）', () => {
  const dir = freshProfile('# template\n[]\n');
  installPanel(dir, join(root, 'plugins', 'turnstile-popup'));
  const { yaml, schema } = loadYaml();
  const doc = yaml.load(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'), { schema });
  assert.ok(Array.isArray(doc), 'patch 必须是数组');
  assert.match(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'), /turnstile-popup/);
});

test('依赖写成 file: 而不是 link:（B14）', () => {
  const dir = freshProfile('[]\n');
  installPanel(dir, join(root, 'plugins', 'turnstile-popup'));
  const dep = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies['turnstile-popup'];
  assert.match(dep, /^file:/, dep);
});

test('已装过再装一次不重复追加', () => {
  const dir = freshProfile('[]\n');
  installPanel(dir, join(root, 'plugins', 'turnstile-popup'));
  installPanel(dir, join(root, 'plugins', 'turnstile-popup'));
  const text = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8');
  assert.strictEqual((text.match(/id: turnstile-popup/g) || []).length, 1);
});

test('现有 patch 非空时追加且仍是合法数组', () => {
  const dir = freshProfile('- insert:\n    - id: someone-else\n');
  installPanel(dir, join(root, 'plugins', 'turnstile-popup'));
  const { yaml, schema } = loadYaml();
  const doc = yaml.load(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'), { schema });
  assert.strictEqual(doc.length, 2);
});

test('现有 patch 已经坏了：拒绝安装而不是叠上去', () => {
  const dir = freshProfile('- id: a\n   nested: bad\n');
  assert.throws(() => installPanel(dir, join(root, 'plugins', 'turnstile-popup')), /无法解析/);
});

console.log('INSTALLPANEL_TEST_OK ' + passed + ' checks');
