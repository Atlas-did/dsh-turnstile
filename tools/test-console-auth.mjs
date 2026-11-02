// 控制台认证负例（方案 §17-2）：这些断言描述「必须」的行为，不是当前行为。
// 现在应当红：console-server 还没有认证中间层，任何本机请求都能读数据、直接写 patch。
// 接入统一策略后本文件必须转绿，并加入 test:all。
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { copyTreeSafe } from './safe-copy.mjs';
import { createConsoleServer } from './console-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'console-auth-'));
const profileDir = join(tmp, 'profile');
copyTreeSafe(join(here, '..', 'tests', 'console-fixture'), profileDir);
const patchPath = join(profileDir, 'cordis.patch.yml');
const patchBefore = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const server = createConsoleServer({ profileDir, stateDir: join(tmp, 'state'), fixture: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const call = async (path, init = {}) => {
  const res = await fetch(base + path, init);
  return { status: res.status, text: await res.text() };
};

try {
  const read = await call('/api/console');
  ok('未认证不能读控制台数据', read.status === 401, 'status=' + read.status);

  const asset = await call('/turnstile/tokens.css');
  ok('未认证不能取静态资源', asset.status === 401, 'status=' + asset.status);

  const health = await call('/health');
  ok('存活探针保持匿名', health.status === 200, 'status=' + health.status);

  const authRead = await fetch(base + '/api/console', { headers: { 'x-turnstile-token': server.turnstileToken } });
  ok('正确的令牌可以读数据', authRead.status === 200, 'status=' + authRead.status);
  const names = (await authRead.json()).plugins.map((p) => p.name).filter(Boolean);
  const target = names.find((n) => /plug-/.test(n)) || names[0];
  const wrong = await call('/api/console', { headers: { 'x-turnstile-token': 'nope-' + Date.now() } });
  ok('错误的令牌同样是 401', wrong.status === 401, 'status=' + wrong.status);
  const crossOrigin = await call('/api/console', { headers: { 'x-turnstile-token': server.turnstileToken, origin: 'http://evil.example' } });
  ok('跨源请求即使带对令牌也 403', crossOrigin.status === 403, 'status=' + crossOrigin.status);
  // fetch 不允许改 Host，这条只能用 http.request 打
  const badHost = await new Promise((resolve) => {
    const probe = request({ host: '127.0.0.1', port: server.address().port, path: '/api/console', method: 'GET', headers: { host: 'evil.example', 'x-turnstile-token': server.turnstileToken } }, (r2) => { r2.resume(); resolve(r2.statusCode); });
    probe.on('error', () => resolve(0));
    probe.end();
  });
  ok('非本机 Host 被拒绝（防 rebinding）', badHost === 403, 'status=' + badHost);
  const toggle = await call('/turnstile/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: target, dryRun: false, disable: true }),
  });
  const patchAfter = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  ok('未认证不能直接写 patch', toggle.status === 401, 'status=' + toggle.status);
  ok('没有凭据时 patch 一个字节都不变', patchAfter === patchBefore, patchAfter === patchBefore ? '' : 'patch 已被未认证请求改写');
} finally {
  server.close();
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
console.log('');
console.log(fail ? 'CONSOLE_AUTH_BYPASSES ' + fail + '（预期：接入统一认证前为红）' : 'CONSOLE_AUTH_OK');
process.exitCode = fail ? 1 : 0;
