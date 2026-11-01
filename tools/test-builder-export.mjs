// B2：导出的插件必须真的能跑（用假 ctx 调一次 handler）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPluginFiles } from '../plugins/turnstile-popup/lib/plugin-export.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'exp-'));
const page = { schema: 'mini/page@1', root: { id: 'stack-1', type: 'stack', props: { direction: 'column', gap: 8 }, style: {}, children: [
  { id: 'heading-1', type: 'heading', props: { text: '导出的页面标题', level: 2 }, style: {}, children: [] },
] } };
const pageFile = join(tmp, 'page.json');
writeFileSync(pageFile, JSON.stringify(page));
const out = join(tmp, 'pkg');
const r = execFileSync(process.execPath, [join(root, 'tools', 'builder-export.mjs'), pageFile, out, '--name', 'my-page'], { encoding: 'utf8' });
ok('导出成功并打印路由', /my-page/.test(r) && /\/my-page/.test(r));
for (const f of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/page.json', 'lib/page-render.js', 'README.md']) ok('产出 ' + f, existsSync(join(out, f)));
const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
ok('package.json 指向自己的 patch', pkg.dsh.bundle.patch === './cordis.patch.yml' && pkg.name === 'my-page');
ok('导出渲染器与搭建器逐字一致', readFileSync(join(out, 'lib', 'page-render.js'), 'utf8') === readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'page-render.js'), 'utf8'));

// 真跑一次 handler
const mod = await import(pathToFileURL(join(out, 'lib', 'index.js')).href);
const routes = [];
const ctx = { effect: (fn) => { fn(); }, webServer: { register: (x) => routes.push(x) } };
mod.apply(ctx);
ok('注册了一个路由', routes.length === 1 && routes[0].path === '/my-page');
let body = '';
const res = { writeHead: () => {}, end: (s) => { body = String(s); } };
await routes[0].handler({ method: 'GET', url: '/my-page' }, res);
ok('handler 返回 HTML 且含页面文字', /<!DOCTYPE html>/.test(body) && /导出的页面标题/.test(body));

// 页面文字不能提前闭合 script，插件名也不能变成路径。
let badName = false;
try { createPluginFiles(page, { name: '../escape', renderer: 'window.TurnstilePageRender={}' }); } catch { badName = true; }
ok('非法插件名被拒绝', badName);
const unsafe = structuredClone(page);
unsafe.root.children[0].props.text = 'before</script><script>window.__broken=true</script>after';
const unsafeFile = join(tmp, 'unsafe.json');
writeFileSync(unsafeFile, JSON.stringify(unsafe));
const unsafeOut = join(tmp, 'unsafe-pkg');
execFileSync(process.execPath, [join(root, 'tools', 'builder-export.mjs'), unsafeFile, unsafeOut, '--name', 'safe-page'], { encoding: 'utf8' });
const unsafeMod = await import(pathToFileURL(join(unsafeOut, 'lib', 'index.js')).href);
const unsafeRoutes = [];
unsafeMod.apply({ effect: (fn) => { fn(); }, webServer: { register: (x) => unsafeRoutes.push(x) } });
let unsafeBody = '';
await unsafeRoutes[0].handler({ method: 'GET', url: '/safe-page' }, { writeHead: () => {}, end: (s) => { unsafeBody = String(s); } });
ok('页面文本中的 </script> 被安全转义', (unsafeBody.match(/<\/script>/gi) || []).length === 2 && !unsafeBody.includes('<script>window.__broken'), 'closers=' + (unsafeBody.match(/<\/script>/gi) || []).length + ' injected=' + unsafeBody.includes('<script>window.__broken'));

const verifyOut = execFileSync(process.execPath, [join(root, 'tools', 'verify-export.mjs'), out, '--json'], { encoding: 'utf8' });
const verification = JSON.parse(verifyOut);
ok('隔离宿主完成初次加载与重启加载', verification.ok && verification.boots.length === 2 && verification.boots.every((b) => b.status === 200));
ok('自检明确不代表真实 mini 试装', verification.scope === 'isolated-module-host' && verification.realDsh === false);
writeFileSync(join(out, 'lib', 'index.js'), 'export function apply() {}\n');
let badPluginFailed = false;
try { execFileSync(process.execPath, [join(root, 'tools', 'verify-export.mjs'), out], { encoding: 'utf8', stdio: 'pipe' }); } catch { badPluginFailed = true; }
ok('没有注册页面路由时自检必须失败', badPluginFailed);

// 坏输入必须拒绝
let threw = false;
try { execFileSync(process.execPath, [join(root, 'tools', 'builder-export.mjs'), join(tmp, 'nope.json'), join(tmp, 'x')], { encoding: 'utf8', stdio: 'pipe' }); } catch { threw = true; }
ok('page 不存在时非零退出', threw);

console.log(fail ? 'EXPORT_TEST_FAILED ' + fail : 'EXPORT_TEST_OK');
process.exitCode = fail ? 1 : 0;
