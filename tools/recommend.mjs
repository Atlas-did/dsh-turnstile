#!/usr/bin/env node
// 推荐插件：谁值得装、装没装、装完怎么和本项目接上。
// usage: node tools/recommend.mjs [<profile>] [--json] [--only genui]
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const profile = argv.find((a) => !a.startsWith('--') && a !== val('--only')) || '';
const catalog = JSON.parse(readFileSync(join(root, 'recommendations', 'plugins.json'), 'utf8'));

function versionOf(name) {
  if (!profile) return null;
  const p = join(profile, 'node_modules', name, 'package.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')).version || '?'; } catch (e) { return '?'; }
}

const only = val('--only');
const rows = catalog.plugins
  .filter((p) => !only || p.name.toLowerCase().includes(only.toLowerCase()))
  .map((p) => Object.assign({}, p, { installed: Boolean(versionOf(p.name)), version: versionOf(p.name) || '' }));

if (argv.includes('--json')) {
  console.log(JSON.stringify({ profile: profile || null, updatedAt: catalog.updatedAt, plugins: rows }, null, 1));
  process.exit(0);
}

console.log('推荐插件 · 目录更新于 ' + catalog.updatedAt);
if (profile) console.log('检查 profile：' + profile);
console.log('');
for (const p of rows) {
  const mark = p.installed ? ('已装 ' + p.version) : '未装';
  console.log(p.name + '  [' + mark + ']');
  console.log('  是什么：' + p.what);
  console.log('  怎么接：' + p.integratesWith);
  if (p.tryIt) console.log('  试一下：' + p.tryIt);
  // 三种情况都要说清，否则读者会以为「目录里写 installed」= 本机实测过
  if (p.status === 'installed' && !p.installed) console.log('  注意：目录标记为已装（当初在某处验过），但**这个 profile 里没有**；接入方式那行仍是实测结论，安装状态不是');
  if (!p.installed && p.status === 'unverified') console.log('  注意：本机没装也没读源码，接入方式是基于公开描述的推断（未验证）');
  console.log('');
}
const missing = rows.filter((p) => !p.installed);
if (missing.length) {
  console.log('要装：node tools/preinstall.mjs <profile> ' + missing.map((p) => p.name).join(' / '));
  console.log('装完再跑：node tools/preflight.mjs <profile>');
} else {
  console.log('推荐的都装上了。');
}
