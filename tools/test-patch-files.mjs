// 外部 agent 报告的真 bug：dsh.bundle.patch 是数组时，工具崩在 patch.replace。
// 三个工具都假设它是字符串。这里锁住修复。
import assert from 'node:assert';
import { patchFiles } from './lib/patch-files.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('字符串 patch 解析成一个文件', () => {
  assert.deepStrictEqual(patchFiles('/p', './cordis.patch.yml').map((x) => x.replace(/\\/g, '/')), ['/p/cordis.patch.yml']);
});

test('数组 patch 解析成多个文件（原来这里会崩）', () => {
  const out = patchFiles('/p', ['./a.yml', './b.yml']).map((x) => x.replace(/\\/g, '/'));
  assert.deepStrictEqual(out, ['/p/a.yml', '/p/b.yml']);
});

test('空值与非字符串条目被忽略', () => {
  assert.deepStrictEqual(patchFiles('/p', null), []);
  assert.deepStrictEqual(patchFiles('/p', [null, 42, './ok.yml']).length, 1);
});

test('ui-surfaces 在数组 patch 的 profile 上不再崩（外部报告的复现）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrpatch-'));
  mkdirSync(join(dir, 'node_modules', 'arrpatch'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'arrpatch', 'package.json'), JSON.stringify({ name: 'arrpatch', version: '1.0.0', dsh: { bundle: { patch: ['./a.patch.yml', './b.patch.yml'] }, client: { inject: ['@deepseek-ai/dsh-client-ui-slots'] } } }));
  writeFileSync(join(dir, 'node_modules', 'arrpatch', 'a.patch.yml'), '- insert:\n    - id: ui-alpha\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dsh: { profile: { bundles: ['arrpatch'] } } }));
  const out = execFileSync(process.execPath, [join(here, 'ui-surfaces.mjs'), dir], { encoding: 'utf8' });
  assert.match(out, /ui-alpha|ui-/, out.slice(0, 80));
});

console.log('PATCHFILES_TEST_OK ' + passed + ' checks');
