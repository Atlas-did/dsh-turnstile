// Shared page-plugin exporter. CLI, hosted console and offline console all use this module.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function normalizePluginName(value) {
  const name = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('插件名只能使用小写字母、数字和连字符，并以字母或数字开头');
  return name;
}

export function validatePage(page) {
  if (!page || page.schema !== 'mini/page@1' || !page.root || typeof page.root !== 'object' || Array.isArray(page.root)) {
    throw new Error('不是 mini/page@1 的页面：缺 schema 或有效 root');
  }
  return page;
}

function hostSource(name) {
  const route = '/' + name;
  return `import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const inject = ['webServer'];
export function apply(ctx) {
  const here = dirname(fileURLToPath(import.meta.url));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: ${JSON.stringify(route)},
    handler: async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' }); res.end('{"error":"method"}'); return; }
      try {
        const page = readFileSync(join(here, 'page.json'), 'utf8').replace(/</g, '\\\\u003c');
        const renderer = readFileSync(join(here, 'page-render.js'), 'utf8').replace(/<\\/script/gi, '<\\\\/script');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><body style="margin:0;padding:20px;background:#0b1117;color:#e9eff4;font:13px/1.5 system-ui"><main id="root" style="max-width:1100px;margin:auto"></main><script>' + renderer + '</script><script>var page=' + page + ';document.getElementById(' + JSON.stringify('root') + ').append(window.TurnstilePageRender.render(page.root));</script></body>');
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: String(e.message || e).slice(0, 180) }));
      }
    },
  }), ${JSON.stringify(name + ': GET ' + route)});
}
`;
}

export function createPluginFiles(page, { name, renderer } = {}) {
  validatePage(page);
  const pkgName = normalizePluginName(name);
  if (typeof renderer !== 'string' || !renderer.includes('TurnstilePageRender')) throw new Error('缺少共享页面渲染器');
  const route = '/' + pkgName;
  return {
    'package.json': JSON.stringify({
      name: pkgName, version: '0.1.0', type: 'module', description: 'A page built with the Turnstile page builder',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { inject: [] }, compatibility: { dshReleases: {} } },
    }, null, 2) + '\n',
    'cordis.patch.yml': '- insert:\n    - id: ' + pkgName + '\n      name: ' + pkgName + '\n',
    'lib/index.js': hostSource(pkgName),
    'lib/page.json': JSON.stringify(page, null, 2) + '\n',
    'lib/page-render.js': renderer,
    'README.md': ['# ' + pkgName, '', '用 Turnstile 页面搭建器导出。', '', '## 检查', '```bash', 'node <turnstile>/tools/verify-export.mjs .', 'node <turnstile>/tools/preinstall.mjs <profile> ' + pkgName, '```', '', 'verify-export 只证明隔离模块宿主能加载，不代表已试装真实 mini。', '', '## 安装', '把 ' + pkgName + ' 放进 profile 的 node_modules，并加入 dsh.profile.bundles，重启 DSH。', '', '## 访问', '页面在 ' + route + '（同一端口）。', ''].join('\n'),
  };
}

export function exportPlugin(page, outDir, options = {}) {
  const files = createPluginFiles(page, options);
  for (const [relative, content] of Object.entries(files)) {
    const target = join(outDir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { name: normalizePluginName(options.name), route: '/' + normalizePluginName(options.name), outDir, files: Object.keys(files) };
}
