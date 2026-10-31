#!/usr/bin/env node
// 看一个插件的实现骨架（CLI）。核心逻辑在 plugins/turnstile-popup/lib/plugin-inspect.js，与宿主路由共用。
//
// usage: node tools/inspect-plugin.mjs <profileDir> <pkg> [--lines 40] [--json]
import { inspectPlugin } from '../plugins/turnstile-popup/lib/plugin-inspect.js';

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const [profileDir, pkgName] = args;
if (!profileDir || !pkgName) { console.error('usage: node tools/inspect-plugin.mjs <profileDir> <pkg> [--lines 40] [--json]'); process.exit(2); }

const res = inspectPlugin(profileDir, pkgName, { lines: Number(val('--lines') || 40) });
if (argv.includes('--json')) { console.log(JSON.stringify(res.data || res, null, 1)); process.exit(res.ok ? 0 : (res.code || 1)); }

if (!res.ok && res.code === 3) {
  console.log(pkgName + ' · 未安装');
  console.log('  在 bundles 里: ' + res.data.inBundles);
  console.log('  → node tools/preinstall.mjs <profile> ' + pkgName);
  process.exit(3);
}
if (!res.ok) { console.error(res.reason); process.exit(res.code || 1); }

const d = res.data;
console.log('插件 ' + d.pkg + (d.version ? ' @' + d.version : ''));
console.log('  状态   ' + (d.installed ? '已安装' : '未安装') + (d.inBundles ? ' · 在 bundles' : ' · 不在 bundles') + (d.disabled ? ' · 已被停用' : ''));
console.log('  引擎   ' + (d.declaration.engine ? JSON.stringify(d.declaration.engine) : '未声明') + '   平台 ' + (d.declaration.platform || '未声明'));
console.log('  inject ' + (d.injects.length ? d.injects.length + ' 个面：' + d.injects.map((i) => i.replace('@deepseek-ai/dsh-client-', '')).join(', ') : '无'));
console.log('  patch  ' + (d.patchFiles.length ? d.patchFiles.join(', ') + (d.patchRows.length ? ' → 行 ' + d.patchRows.join(', ') : '') : '无'));
if (d.entry) console.log('  入口   ' + d.entry + '  (' + d.entryBytes + ' 字节)');
if (d.slotKeys.length) console.log('  slot   ' + d.slotKeys.join(', '));
if (d.injectCalls.length) console.log('  inject 调用 ' + d.injectCalls.join(', '));
if (d.classNames.length) console.log('  类名   ' + d.classNames.slice(0, 8).join(', '));
if (d.testIds.length) console.log('  testid ' + d.testIds.slice(0, 8).join(', '));
if (d.files.length) console.log('  文件   ' + d.files.slice(0, 8).map((f) => f.file + '(' + Math.round(f.bytes / 1024) + 'KB)').join(' '));
if (d.head.length) {
  console.log('');
  console.log('— 源码前 ' + d.head.length + ' 行 —');
  for (const l of d.head) console.log('  ' + l.slice(0, 160));
} else console.log('\n（没有找到客户端入口文件）');
