// NO_PROXY 判定：持久化 ≠ 生效，这条今天真踩过。
import assert from 'node:assert';
import { parseNoProxy, covers, checkNoProxy } from '../tools/lib/proxy.mjs';

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

test('解析逗号/分号/空格混合列表', () => {
  assert.deepStrictEqual(parseNoProxy('localhost, foo.com;bar.org  baz.net'), ['localhost', 'foo.com', 'bar.org', 'baz.net']);
  assert.deepStrictEqual(parseNoProxy(''), []);
});

test('域名后缀匹配：example.com 覆盖 api.example.com', () => {
  assert.strictEqual(covers(['agents-anywhere.com'], 'web.agents-anywhere.com'), true);
  assert.strictEqual(covers(['agents-anywhere.com'], 'agents-anywhere.com'), true);
  assert.strictEqual(covers(['agents-anywhere.com'], 'notagents-anywhere.com'), false);
});

test('前导点与通配都支持', () => {
  assert.strictEqual(covers(['.example.com'], 'a.example.com'), true);
  assert.strictEqual(covers(['172.16.*'], '172.16.5.4'), true);
  assert.strictEqual(covers(['172.16.*'], '172.17.5.4'), false);
});

test('进程里有 → pass', () => {
  const r = checkNoProxy({ host: 'web.agents-anywhere.com', userValue: '', processValue: 'agents-anywhere.com' });
  assert.strictEqual(r.level, 'pass');
});

test('只在用户环境变量里 → warn 且要求重启进程', () => {
  const r = checkNoProxy({ host: 'web.agents-anywhere.com', userValue: 'localhost,agents-anywhere.com', processValue: 'localhost' });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.next, /重启/);
  assert.match(r.message, /当前进程没有读到/);
});

test('两边都没有 → warn 且给出 setx 命令', () => {
  const r = checkNoProxy({ host: 'web.agents-anywhere.com', userValue: '', processValue: '' });
  assert.strictEqual(r.level, 'warn');
  assert.match(r.next, /setx|配置/);
});

console.log('PROXY_TEST_OK ' + passed + ' checks');
