// 注册表快照差异：解析 + 三种变化 + 稳定性。
import assert from 'node:assert';
import { parseRegQuery, diffSnapshots } from '../lib/reg-diff.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const SAMPLE = [
  '',
  'HKEY_CURRENT_USER\\Environment',
  '    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin',
  '    TEMP    REG_SZ          C:\\Temp',
  '',
].join('\r\n');

test('解析出键值对并忽略键头', () => {
  const v = parseRegQuery(SAMPLE);
  assert.deepStrictEqual(Object.keys(v).sort(), ['Path', 'TEMP']);
  assert.strictEqual(v.TEMP.type, 'REG_SZ');
  assert.strictEqual(v.TEMP.value, 'C:\\Temp');
});

test('空输入返回空对象', () => { assert.deepStrictEqual(parseRegQuery(''), {}); });

test('新增 / 修改 / 删除都能识别', () => {
  const a = parseRegQuery(SAMPLE);
  const b = parseRegQuery(SAMPLE.replace('C:\\Temp', 'D:\\Tmp').replace('    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin\r\n', '') + '    NEW    REG_SZ    x\r\n');
  const d = diffSnapshots(a, b);
  const byName = Object.fromEntries(d.map((c) => [c.name, c.event]));
  assert.strictEqual(byName.TEMP, 'changed');
  assert.strictEqual(byName.Path, 'removed');
  assert.strictEqual(byName.NEW, 'added');
});

test('没有变化时返回空数组', () => { assert.deepStrictEqual(diffSnapshots(parseRegQuery(SAMPLE), parseRegQuery(SAMPLE)), []); });

test('改动事件带 was 旧值', () => {
  const a = { A: { type: 'REG_SZ', value: 'old' } };
  const b = { A: { type: 'REG_SZ', value: 'new' } };
  assert.strictEqual(diffSnapshots(a, b)[0].was, 'old');
});

console.log(failOk());
function failOk() { return process.exitCode ? 'REGBIFF_TEST_FAILED' : 'REGBIFF_TEST_OK ' + passed + ' checks'; }
