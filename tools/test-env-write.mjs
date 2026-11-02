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

const fixture = join(process.cwd(), 'tests', 'console-fixture');
const { copyTreeSafe } = await import('./safe-copy.mjs');
for (const name of ['envA', 'envB']) copyTreeSafe(fixture, join(home, 'profiles', name));
const dirA = join(home, 'profiles', 'envA');
const dirB = join(home, 'profiles', 'envB');
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
  const call = async (url, payload = { package: 'plug-alpha', disable: true, dryRun: false }) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader() {}, writeHead(c) { this.statusCode = c; }, end(body) { resolve({ code: this.statusCode, body: String(body || '') }); } };
    const req = { method: 'POST', url, // 宿主当前只检查令牌字段存在（C-02，未解决）：这里给非空值即可通过 guard
      headers: { 'x-turnstile-token': 'test-token' }, [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(payload)); } };
    Promise.resolve(toggle.handler(req, res)).catch((e) => resolve({ code: 500, body: String(e && e.message) }));
  });
  // 宿主 toggle 是两步：先拿计划（needsConfirm），再带 confirm 真写
  let out = await call('/turnstile/toggle?env=main:envB');
  try { const j = JSON.parse(out.body); if (j && j.needsConfirm && j.plan) { const confirm = j.plan.confirm || j.plan.id || j.plan.confirmation; out = await call('/turnstile/toggle?env=main:envB', { package: 'plug-alpha', disable: true, dryRun: false, confirm }); } } catch {}
  // 若目标是「当前已是该状态」，写操作会正确地什么都不写——再反向试一次，证明写入本身可行
  if (readFileSync(join(dirB, 'cordis.patch.yml'), 'utf8') === beforeB) out = await call('/turnstile/toggle?env=main:envB', { package: 'plug-alpha', disable: false, dryRun: false });
  const afterA = readFileSync(join(dirA, 'cordis.patch.yml'), 'utf8');
  const afterB = readFileSync(join(dirB, 'cordis.patch.yml'), 'utf8');
  // 只认真正写成功：200 且内容变了；404/401 之类的“没写”不能算通过
  ok('选中的环境 B 真的被写（200 且出现 disabled: true）', out.code === 200 && afterB !== beforeB && /disabled:\s*true/.test(afterB), 'code=' + out.code);
  ok('B 里只有一条 alpha-row（没有重复行）', (afterB.match(/^- id:\s*alpha-row$/gm) || []).length === 1);
  ok('未选中的环境 A 一个字节都没变', afterA === beforeA, 'A changed at code ' + out.code);
}
rmSync(home, { recursive: true, force: true });
console.log(fail ? 'ENV_WRITE_FAILED ' + fail : 'ENV_WRITE_OK');
process.exitCode = fail ? 1 : 0;
