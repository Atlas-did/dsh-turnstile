#!/usr/bin/env node
// 看一个插件的实现骨架：一条命令，不再翻 node_modules。
//
// usage: node tools/inspect-plugin.mjs <profileDir> <pkg> [--lines 40] [--json]
//
// 输出（人读版）：
//   安装状态 / dsh 声明 / inject 面 / patch 行 / 客户端入口 / slot 与类名 / 源码前 N 行
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { patchFiles } from './lib/patch-files.mjs';

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const [profileDir, pkgName] = args;
if (!profileDir || !pkgName) { console.error('usage: node tools/inspect-plugin.mjs <profileDir> <pkg> [--lines 40] [--json]'); process.exit(2); }
if (!existsSync(join(profileDir, 'package.json'))) { console.error('not a profile: ' + profileDir); process.exit(2); }

const lines = Number(val('--lines') || 40);
const pluginDir = join(profileDir, 'node_modules', pkgName);
const pkgPath = join(pluginDir, 'package.json');
const installed = existsSync(pkgPath);
const profilePkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const bundles = (profilePkg.dsh && profilePkg.dsh.profile && profilePkg.dsh.profile.bundles) || [];
const inBundles = bundles.includes(pkgName);
const patchPath = join(profileDir, 'cordis.patch.yml');
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
const disabled = new RegExp('id:\\s*' + pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n\\s*disabled:\\s*true').test(patchText);

if (!installed) {
  const out = { pkg: pkgName, profile: profileDir, installed: false, inBundles, hint: '没装：node tools/preinstall.mjs <profile> ' + pkgName };
  if (argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
  else { console.log(pkgName + ' · 未安装'); console.log('  在 bundles 里: ' + inBundles); console.log('  → ' + out.hint); }
  process.exit(3);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const dsh = pkg.dsh || {};
const injects = (dsh.client && dsh.client.inject) || [];
const patchFilesList = patchFiles(pluginDir, dsh.bundle && dsh.bundle.patch);

const rows = [];
for (const f of patchFilesList) {
  if (!existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) rows.push(m[1]);
}

// 客户端入口：常见是 lib/client.js；也接受 package.json 里显式写出的文件
const candidates = ['lib/client.js', 'lib/client.mjs', 'dist/client.js', (dsh.client && dsh.client.entry) || ''].filter(Boolean);
const entry = candidates.map((c) => join(pluginDir, c)).find((p) => existsSync(p)) || '';
const source = entry ? readFileSync(entry, 'utf8') : '';

// slot / 类名 / 关键 API：只做正则扫描，不猜语义
const slotKeys = [...new Set([...source.matchAll(/["']((?:shell|ui|sidebar|conversation|settings)\.[\w.-]+)["']/g)].map((m) => m[1]))].slice(0, 12);
// 两种写法都要吃：编译后的 className: "x"，以及 JSX/字符串里的 className="x"、class="x"
const classNames = [...new Set([
  ...[...source.matchAll(/className\s*[:=]\s*["']([\w-]{3,40})["']/g)].map((m) => m[1]),
  ...[...source.matchAll(/\bclass\s*=\s*["']([\w-]{3,40})["']/g)].map((m) => m[1]),
])].slice(0, 12);
const testIds = [...new Set([...source.matchAll(/data-testid["']?\s*[:=]\s*["']([\w-]{2,40})["']/g)].map((m) => m[1]))].slice(0, 12);
const injectCalls = [...new Set([...source.matchAll(/\.inject\(\s*["']([^"']+)["']/g)].map((m) => m[1]))].slice(0, 12);

const files = [];
try {
  for (const f of readdirSync(pluginDir)) {
    const st = statSync(join(pluginDir, f));
    if (st.isFile() && /\.(js|mjs|cjs|yml|yaml)$/.test(f)) files.push({ file: f, bytes: st.size });
  }
} catch {}

const head = source ? source.split(/\r?\n/).slice(0, lines) : [];

const data = {
  pkg: pkgName, version: pkg.version || '', profile: profileDir,
  installed, inBundles, disabled,
  declaration: { engine: pkg.engines && pkg.engines.dsh, compatibility: dsh.compatibility || null, platform: dsh.client && dsh.client.platform || null },
  injects, patchFiles: patchFilesList.map((p) => p.split(/[\\/]/).slice(-1)[0]), patchRows: rows,
  entry: entry ? entry.split(/[\\/]/).slice(-2).join('/') : '',
  slotKeys, classNames, testIds, injectCalls, files,
  head,
};

if (argv.includes('--json')) { console.log(JSON.stringify(data, null, 1)); process.exit(0); }

console.log('插件 ' + pkgName + (pkg.version ? ' @' + pkg.version : ''));
console.log('  状态   ' + (installed ? '已安装' : '未安装') + (inBundles ? ' · 在 bundles' : ' · 不在 bundles') + (disabled ? ' · 已被停用' : ''));
console.log('  引擎   ' + (data.declaration.engine ? JSON.stringify(data.declaration.engine) : '未声明') + '   平台 ' + (data.declaration.platform || '未声明'));
console.log('  inject ' + (injects.length ? injects.length + ' 个面：' + injects.map((i) => i.replace('@deepseek-ai/dsh-client-', '')).join(', ') : '无'));
console.log('  patch  ' + (data.patchFiles.length ? data.patchFiles.join(', ') + (rows.length ? ' → 行 ' + rows.join(', ') : '') : '无'));
if (entry) console.log('  入口   ' + data.entry + '  (' + source.length + ' 字节)');
if (slotKeys.length) console.log('  slot   ' + slotKeys.join(', '));
if (injectCalls.length) console.log('  inject 调用 ' + injectCalls.join(', '));
if (classNames.length) console.log('  类名   ' + classNames.slice(0, 8).join(', '));
if (testIds.length) console.log('  testid ' + testIds.slice(0, 8).join(', '));
if (files.length) console.log('  文件   ' + files.slice(0, 8).map((f) => f.file + '(' + Math.round(f.bytes / 1024) + 'KB)').join(' '));
if (head.length) {
  console.log('');
  console.log('— 源码前 ' + head.length + ' 行 —');
  for (const l of head) console.log('  ' + l.slice(0, 160));
} else console.log('\n（没有找到客户端入口文件）');
