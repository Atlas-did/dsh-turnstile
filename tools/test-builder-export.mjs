// B2：导出的插件必须真的能跑（用假 ctx 调一次 handler）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
for (const f of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/page.json', 'README.md']) ok('产出 ' + f, existsSync(join(out, f)));
const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
ok('package.json 指向自己的 patch', pkg.dsh.bundle.patch === './cordis.patch.yml' && pkg.name === 'my-page');

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

// 坏输入必须拒绝
let threw = false;
try { execFileSync(process.execPath, [join(root, 'tools', 'builder-export.mjs'), join(tmp, 'nope.json'), join(tmp, 'x')], { encoding: 'utf8', stdio: 'pipe' }); } catch { threw = true; }
ok('page 不存在时非零退出', threw);

console.log(fail ? 'EXPORT_TEST_FAILED ' + fail : 'EXPORT_TEST_OK');
process.exitCode = fail ? 1 : 0;
