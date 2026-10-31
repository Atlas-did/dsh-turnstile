#!/usr/bin/env node
// B2：把搭建好的页面导出成一个真正的 DSH 插件（bundle 形态，自带只读页面路由）。
// usage: node tools/builder-export.mjs <page.json> <outDir> [--name my-page]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const HOST = "import { readFileSync } from 'node:fs';\nimport { join, dirname } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nexport const inject = ['webServer'];\nexport function apply(ctx) {\n  const here = dirname(fileURLToPath(import.meta.url));\n  ctx.effect(() => ctx.webServer.register({\n    kind: 'exact', path: '__ROUTE__',\n    handler: async (req, res) => {\n      const page = readFileSync(join(here, 'page.json'), 'utf8');\n      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });\n      res.end('<!DOCTYPE html><meta charset=utf-8><body style=\"margin:0;padding:16px;background:#0d141c;color:#dce3ea;font:13px system-ui\"><div id=root></div><script>var p=' + page + ';(function walk(n){var d=document.createElement(\"div\");d.style.cssText=\"margin:4px 0\";if(n.props&&n.props.text)d.textContent=n.props.text;else if(n.props&&n.props.title)d.textContent=n.props.title;if(n.children)(n.children||[]).forEach(function(c){d.append(walk(c))});return d})(p.root)&&document.getElementById(\"root\").append((function walk(n){var d=document.createElement(\"div\");if(n.props&&n.props.text)d.textContent=n.props.text;else if(n.props&&n.props.title)d.textContent=n.props.title;(n.children||[]).forEach(function(c){d.append(walk(c))});return d})(p.root));</script>');\n    },\n  }), '__NAME__: GET __ROUTE__');\n}\n";
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const val = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const [pageFile, outDir] = args;
if (!pageFile || !outDir) { console.error('usage: node tools/builder-export.mjs <page.json> <outDir> [--name my-page]'); process.exit(2); }
if (!existsSync(pageFile)) { console.error('page 不存在: ' + pageFile); process.exit(2); }
let page;
try { page = JSON.parse(readFileSync(pageFile, 'utf8')); } catch (e) { console.error('page 不是 JSON: ' + e.message); process.exit(2); }
if (!page || page.schema !== 'mini/page@1' || !page.root) { console.error('不是 mini/page@1 的页面：缺 schema 或 root'); process.exit(2); }

const name = val('--name') || ('page-' + basename(outDir).replace(/[^a-z0-9-]/gi, '-'));
const route = '/' + name;
mkdirSync(join(outDir, 'lib'), { recursive: true });
writeFileSync(join(outDir, 'package.json'), JSON.stringify({
  name, version: '0.1.0', type: 'module', description: 'A page built with the turnstile page builder',
  dsh: { bundle: { patch: './cordis.patch.yml' }, client: { inject: [] }, compatibility: { dshReleases: {} } },
}, null, 2) + '\n');
writeFileSync(join(outDir, 'cordis.patch.yml'), '- insert:\n    - id: ' + name + '\n      name: ' + name + '\n');
writeFileSync(join(outDir, 'lib', 'index.js'), HOST.replace(/__ROUTE__/g, route).replace(/__NAME__/g, name) + '\n');
writeFileSync(join(outDir, 'lib', 'page.json'), JSON.stringify(page, null, 2) + '\n');
writeFileSync(join(outDir, 'README.md'), ['# ' + name, '', '用 turnstile 页面搭建器导出。', '', '## 安装', '```bash', 'node tools/preinstall.mjs <profile> ' + name, 'cp -r ' + outDir + ' <profile>/node_modules/' + name, '```', '把 ' + name + ' 加进 profile 的 dsh.profile.bundles，重启 DSH。', '', '## 访问', '页面在 ' + route + '（同一端口）。', ''].join('\n'));
console.log('已导出 ' + outDir);
console.log('  name    ' + name);
console.log('  route   ' + route);
console.log('  文件    package.json / cordis.patch.yml / lib/index.js / lib/page.json / README.md');
