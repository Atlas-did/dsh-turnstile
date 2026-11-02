// B8：写 patch 之前必须确认现文件能解析、写后也能解析，且必须留 .bak。
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { patchParseError, safeWritePatch, fingerprint } from '../tools/lib/patch-write.mjs';

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


test('前置指纹不一致 → 视为并发冲突，不写不留 bak', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n');
  const planned = fingerprint('- id: a\n');
  writeFileSync(f, '- id: a\n- id: someone-else\n');
  const current = readFileSync(f, 'utf8');
  assert.throws(() => safeWritePatch(f, '- id: a\n- id: b\n', { expected: planned, now: () => 2 }), /前置内容已变化/);
  assert.strictEqual(readFileSync(f, 'utf8'), current, '冲突时不能写文件');
  assert.ok(!readdirSync(dir).some((x) => x.includes('.bak-')), '冲突时不该留备份');
});

test('前置指纹一致 → 正常写入', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n');
  const bak = safeWritePatch(f, '- id: a\n- id: b\n', { expected: fingerprint('- id: a\n'), now: () => 3 });
  assert.ok(bak.endsWith('.bak-3'));
  assert.match(readFileSync(f, 'utf8'), /id: b/);
});

test('写后读回比对通过（内容与期望逐字节一致）', () => {
  const dir = tmp();
  const f = join(dir, 'cordis.patch.yml');
  writeFileSync(f, '- id: a\n');
  const next = '- id: a\n  name: a\n';
  safeWritePatch(f, next, { now: () => 4 });
  assert.strictEqual(readFileSync(f, 'utf8'), next);
});

test('指纹函数对内容敏感、对换行差异敏感', () => {
  assert.notStrictEqual(fingerprint('- id: a\n'), fingerprint('- id: a\r\n'));
  assert.strictEqual(fingerprint('- id: a\n'), fingerprint('- id: a\n'));
});
console.log('PATCHWRITE_TEST_OK ' + passed + ' checks');
