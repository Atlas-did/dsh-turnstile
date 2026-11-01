#!/usr/bin/env node
// 新建插件骨架（P1 创作闭环第 1 步）：生成的包必须「能被宿主真的加载」，
// 所以这里内置了两个曾把 trial 卡在 L2 的坑：
//   1) package.json 必须有 dsh.bundle.patch（否则宿主报 declares no dsh.bundle）
//   2) bundle patch 必须用 - insert: 包一层（顶层 - id: 会报 entry not found）
//
// usage: node tools/new-plugin.mjs <name> [--dir <parent>] [--template ui-page|route] [--dry-run] [--json]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const name = argv.find((a) => !a.startsWith('--') && a !== val('--dir') && a !== val('--template'));
if (!name) { console.error('usage: node tools/new-plugin.mjs <name> [--dir <parent>] [--template ui-page|route]'); process.exit(2); }
if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) { console.error('包名要不合法：小写字母开头，只允许 a-z 0-9 -（收到 ' + name + '）'); process.exit(2); }

const template = val('--template') || 'ui-page';
if (!['ui-page', 'route'].includes(template)) { console.error('未知模板：' + template + '（可用 ui-page / route）'); process.exit(2); }
const parent = resolve(val('--dir') || '.');
const outDir = join(parent, name);
const route = '/' + name;

const files = {};
files['package.json'] = JSON.stringify({
  name, version: '0.1.0', type: 'module', main: 'lib/index.js',
  // 只做服务端的插件不要写 dsh.client：宿主会要求 platform 是字符串，缺了整个 profile 起不来
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}, null, 2) + '\n';
files['cordis.patch.yml'] = '- insert:\n    - id: ' + name + '\n      name: ' + name + '\n';
// 服务端入口：注册一条路由（L3 会真去 GET 它；L4 会看页面里有没有 brand 文本）
const serverIndex = [
  "import { readFileSync } from 'node:fs';",
  "import { join, dirname } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "export const inject = ['webServer'];",
  'export function apply(ctx) {',
  '  const here = dirname(fileURLToPath(import.meta.url));',
  '  ctx.effect(() => ctx.webServer.register({',
  "    kind: 'exact', path: '" + route + "',",
  '    handler: (req, res) => {',
  "      const html = readFileSync(join(here, 'page.html'), 'utf8');",
  "      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
  '      res.end(html);',
  '    },',
  "  }), '" + name + "');",
  '}',
].join('\n');
const routeIndex = [
  "export const inject = ['webServer'];",
  'export function apply(ctx) {',
  '  ctx.effect(() => ctx.webServer.register({',
  "    kind: 'exact', path: '" + route + "',",
  '    handler: (req, res) => {',
  "      res.writeHead(200, { 'content-type': 'application/json' });",
  "      res.end(JSON.stringify({ ok: true, plugin: '" + name + "' }));",
  '    },',
  "  }), '" + name + "');",
  '}',
].join('\n');
files['lib/index.js'] = (template === 'route' ? routeIndex : serverIndex) + '\n';
// 页面模板：品牌文本既是给人的标题，也是 L4 的 --expect 目标
const page = [
  '<!DOCTYPE html><meta charset="utf-8">',
  '<title>' + name + '</title>',
  '<body style="margin:0;padding:24px;background:#0d141c;color:#dce3ea;font:14px system-ui">',
  '<h1 data-brand="' + name + '">' + name + '</h1>',
  '<p>由 turnstile new-plugin 生成。改这里，然后试装验证。</p>',
  '</body>',
].join('');
if (template === 'ui-page') files['lib/page.html'] = page + '\n';

const plan = Object.keys(files).sort();
if (has('--dry-run')) {
  console.log(JSON.stringify({ ok: true, dryRun: true, dir: outDir, template, files: plan, route }, null, 2));
  process.exit(0);
}
if (existsSync(outDir) && !has('--force')) {
  console.error('目录已存在：' + outDir + '（要覆盖加 --force）');
  process.exit(3);
}
for (const [rel, content] of Object.entries(files)) {
  const full = join(outDir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}
const next = [
  { label: '在 mini 试装并做六级验证', command: 'node tools/sandbox-trial.mjs <mini-profile> ' + outDir + ' --keep --json', mutating: true, reason: '装完会重启验证；--keep 保留以便继续改' },
];
if (has('--json')) { console.log(JSON.stringify({ ok: true, dir: outDir, template, files: plan, route, next }, null, 2)); process.exit(0); }
console.log('已创建 ' + name + '（模板 ' + template + '）→ ' + outDir);
for (const f of plan) console.log('  · ' + f);
console.log('路由：' + route + '（重启后可访问）');
console.log('下一步：node tools/sandbox-trial.mjs <mini-profile> ' + outDir + ' --keep --json');
