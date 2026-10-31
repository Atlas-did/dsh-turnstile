// B8：写 patch 之前必须确认现文件能解析、写后也能解析，且必须留 .bak。
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { patchParseError, safeWritePatch } from '../tools/lib/patch-write.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

const tmp = () => mkdtempSync(join(tmpdir(), 'pw-'));

test('能解析的 YAML 返回 null', () => {
  assert.strictEqual(patchParseError('- id: a\n  disabled: true\n', 'x'), null);
});

test('坏缩进返回错误信息', () => {
  const err = patchParseError('- id: a\n   nested: bad\n', 'x');
  assert.ok(err && err.includes('无法解析'), String(err));
});

test('正常写入留 .bak 且内容更新', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n');
  const bak = safeWritePatch(f, '- id: a\n- id: b\n', { now: () => 1 });
  assert.ok(bak.endsWith('.bak-1'));
  assert.match(readFileSync(f, 'utf8'), /id: b/);
  assert.match(readFileSync(bak, 'utf8'), /^- id: a$/m);
});

test('现文件已坏 → 拒绝写入，不改文件也不留 bak（B8 的原始现象）', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n   nested: bad\n');
  const before = readFileSync(f, 'utf8');
  assert.throws(() => safeWritePatch(f, '- id: a\n'), /拒绝/);
  assert.strictEqual(readFileSync(f, 'utf8'), before);
  assert.deepStrictEqual(readdirSync(dir), ['cordis.patch.yml']);
});

test('写入内容不可解析 → 拒绝且不改文件', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n');
  assert.throws(() => safeWritePatch(f, '- id: a\n  - bad: [\n'), /无法解析/);
  assert.strictEqual(readFileSync(f, 'utf8'), '- id: a\n');
});

console.log('PATCHWRITE_TEST_OK ' + passed + ' checks');
