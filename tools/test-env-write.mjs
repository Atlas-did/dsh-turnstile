// 写操作必须落在选中的环境上（合并 3f 的先行测试）：?env= 指向 B 时，A 一个字节都不能变。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { apply } from '../plugins/turnstile-popup/lib/index.js';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const home = mkdtempSync(join(tmpdir(), 'env-write-'));
process.env.DSH_HOME = home;
process.env.DSH_TURNSTILE_HOME = process.cwd();
process.env.DSH_TURNSTILE_STATE = join(home, 'state');
mkdirSync(join(home, 'state'), { recursive: true });

const patchOf = (name) => '- id: ' + name + '\n  name: ' + name + '\n';
const makeProfile = (name) => {
  const dir = join(home, 'profiles', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, dependencies: { 'plug-x': '1.0.0' }, dsh: { profile: { bundles: ['plug-x'] } } }));
  writeFileSync(join(dir, 'cordis.patch.yml'), patchOf('plug-x'));
  mkdirSync(join(dir, 'node_modules', 'plug-x'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'plug-x', 'package.json'), JSON.stringify({ name: 'plug-x', version: '1.0.0', main: 'index.js' }));
  writeFileSync(join(dir, 'node_modules', 'plug-x', 'index.js'), 'module.exports = {};\n');
  return dir;
};
const dirA = makeProfile('envA');
const dirB = makeProfile('envB');
const beforeA = readFileSync(join(dirA, 'cordis.patch.yml'), 'utf8');
const beforeB = readFileSync(join(dirB, 'cordis.patch.yml'), 'utf8');

const routes = [];
const ctx = {
  webServer: { register: (r) => { routes.push(r); return () => {}; } },
  effect: (fn) => { try { fn(); } catch { /* 某些表层在桩里不可用 */ } },
};
try { apply(ctx, { profile: 'envA' }); } catch (e) { console.log('apply threw: ' + String(e && e.message).slice(0, 80)); }
const toggle = routes.find((r) => r.path === '/turnstile/toggle');
ok('注册了 toggle 路由', Boolean(toggle));
if (toggle) {
  const call = async (url) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader() {}, writeHead(c) { this.statusCode = c; }, end(body) { resolve({ code: this.statusCode, body: String(body || '') }); } };
    const req = { method: 'POST', url, // 宿主当前只检查令牌字段存在（C-02，未解决）：这里给非空值即可通过 guard
      headers: { 'x-turnstile-token': 'test-token' }, [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ package: 'plug-x', disable: true, dryRun: false })); } };
    Promise.resolve(toggle.handler(req, res)).catch((e) => resolve({ code: 500, body: String(e && e.message) }));
  });
  const out = await call('/turnstile/toggle?env=main:envB');
  const afterA = readFileSync(join(dirA, 'cordis.patch.yml'), 'utf8');
  const afterB = readFileSync(join(dirB, 'cordis.patch.yml'), 'utf8');
  ok('选中的环境 B 被写', afterB !== beforeB || /disabled/.test(afterB), 'B unchanged: ' + String(out.code));
  ok('未选中的环境 A 一个字节都没变', afterA === beforeA, 'A changed at code ' + out.code);
}
rmSync(home, { recursive: true, force: true });
console.log(fail ? 'ENV_WRITE_FAILED ' + fail : 'ENV_WRITE_OK');
process.exitCode = fail ? 1 : 0;
