// live 同步白名单必须覆盖插件 lib 下所有被 import 的文件（这东西漏过一次就整插件起不来）。
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const sync = readFileSync(join(root, 'tools', 'sync-live.mjs'), 'utf8');
const libDir = join(root, 'plugins', 'turnstile-popup', 'lib');
const libFiles = readdirSync(libDir).filter((f) => /\.(js|css|html)$/.test(f));

// 只要求「被 index.js import 的」和 css/html 资源在白名单里
const index = readFileSync(join(libDir, 'index.js'), 'utf8');
function depsOf(file) {
  const src = readFileSync(join(libDir, file), 'utf8');
  return [...src.matchAll(/from ['"]\.\/([\w.-]+)['"]/g)].map((m) => m[1]);
}
const seen = new Set();
const queue = ['index.js'];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file) || !libFiles.includes(file)) continue;
  seen.add(file);
  for (const dep of depsOf(file)) if (!seen.has(dep)) queue.push(dep);
}
const imported = [...seen].filter((f) => f !== 'index.js').map((f) => 'lib/' + f);
const required = [...new Set(imported)].filter((f) => libFiles.includes(f.replace('lib/', '')));
const missing = required.filter((f) => !sync.includes("'" + f + "'"));
ok('index.js 依赖的 lib 文件都在同步白名单里', missing.length === 0, missing.join(','));

const css = libFiles.filter((f) => f.endsWith('.css')).map((f) => 'lib/' + f);
const cssMissing = css.filter((f) => !sync.includes("'" + f + "'"));
ok('样式资源也在白名单里', cssMissing.length === 0, cssMissing.join(','));

ok('至少检查到 5 个依赖', required.length >= 5, String(required.length));
console.log(fail ? 'SYNC_COVERAGE_FAILED ' + fail : 'SYNC_COVERAGE_OK');
process.exitCode = fail ? 1 : 0;