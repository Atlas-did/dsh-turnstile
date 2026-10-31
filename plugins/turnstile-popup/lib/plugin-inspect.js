'use strict';
// 插件骨架的纯数据层：CLI（tools/inspect-plugin.mjs）与宿主路由（/turnstile/inspect）共用。
// 不打印、不 exit，只返回 { ok, data } 或 { ok:false, code, reason }。
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
// 为什么这里又有一份 patchFiles：live 部署时插件被同步到 research/turnstile-popup/，
// 与 tools/lib/ 不在同一棵树里，静态 import 会 404。所以保留本地实现，
// 但用测试（tools/test-look-tools.mjs 的「两份 patchFiles 行为一致」）盯住漂移。
export function patchFiles(pluginDir, patch) {
  if (!patch) return [];
  const list = Array.isArray(patch) ? patch : [patch];
  return list.filter((p) => typeof p === 'string').map((p) => join(pluginDir, p.replace(/^\.\//, '')));
}

// 包名白名单：普通名或 @scope/name。有它就挡住了 ../、绝对路径、盘符、多级斜杠。
const PKG_RE = /^(@[\w.-]+\/)?[\w.-]+$/;

export function inspectPlugin(profileDir, pkgName, { lines = 40 } = {}) {
  if (!existsSync(join(profileDir, 'package.json'))) return { ok: false, code: 2, reason: 'not a profile: ' + profileDir };
  const name = String(pkgName == null ? '' : pkgName);
  if (!PKG_RE.test(name)) return { ok: false, code: 2, reason: '包名不合法：' + name.slice(0, 60) + '（只接受 name 或 @scope/name）' };
  // 第二道闸：就算名字合法，也要确认解析结果真的还在 node_modules 下（防符号链接逃逸）。
  let realRoot = '';
  let realPkg = '';
  try {
    realRoot = realpathSync(join(profileDir, 'node_modules'));
    realPkg = realpathSync(join(realRoot, name));
  } catch (e) {
    let listed = false;
    try {
      const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
      listed = ((pj.dsh && pj.dsh.profile && pj.dsh.profile.bundles) || []).includes(name);
    } catch (e2) {}
    return { ok: false, code: 3, reason: 'not installed', data: { pkg: name, profile: profileDir, installed: false, inBundles: listed } };
  }
  const rel = relative(realRoot, realPkg);
  if (rel.startsWith('..') || isAbsolute(rel)) return { ok: false, code: 2, reason: '解析到 node_modules 之外，拒绝：' + rel };
  pkgName = name;
  const profilePkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
  const bundles = (profilePkg.dsh && profilePkg.dsh.profile && profilePkg.dsh.profile.bundles) || [];
  const inBundles = bundles.includes(pkgName);
  const patchPath = join(profileDir, 'cordis.patch.yml');
  const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  const disabled = new RegExp('id:\\s*' + pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n\\s*disabled:\\s*true').test(patchText);

  const pluginDir = join(profileDir, 'node_modules', pkgName);
  const pkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { ok: false, code: 3, reason: 'not installed', data: { pkg: pkgName, profile: profileDir, installed: false, inBundles } };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const dsh = pkg.dsh || {};
  const injects = (dsh.client && dsh.client.inject) || [];
  const patchFilesList = patchFiles(pluginDir, dsh.bundle && dsh.bundle.patch);
  const rows = [];
  for (const f of patchFilesList) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) rows.push(m[1]);
  }

  // 入口探测顺序（都找不到时要说「未声明」，不能含糊地说「没找到」）：
  //   1. package.json 的 dsh.client.entry   2. main / browser 字段
  //   3. 常见产物路径（lib/client.js 等）    4. 任意 lib/*.js 且里面有 slot/inject 痕迹
  const candidates = [
    (dsh.client && dsh.client.entry) || '',
    pkg.main || '',
    pkg.browser || '',
    'lib/client.js', 'lib/client.mjs', 'dist/client.js', 'lib/index.js', 'index.js',
  ].filter(Boolean);
  let entry = candidates.map((c) => join(pluginDir, String(c).replace(/^\.\//, ''))).find((p) => existsSync(p)) || '';
  let entryKind = entry ? (entry.endsWith('index.js') ? 'host-or-bundle' : 'client') : 'none';
  if (!entry) {
    const libDir = join(pluginDir, 'lib');
    if (existsSync(libDir)) {
      for (const f of readdirSync(libDir)) {
        if (!/\.(js|mjs)$/.test(f)) continue;
        try {
          const txt = readFileSync(join(libDir, f), 'utf8');
          if (/\.inject\(|ctx\.slots|ctx\.webServer/.test(txt)) { entry = join(libDir, f); entryKind = 'scanned'; break; }
        } catch {}
      }
    }
  }
  const source = entry ? readFileSync(entry, 'utf8') : '';

  const slotKeys = [...new Set([...source.matchAll(/["']((?:shell|ui|sidebar|conversation|settings)\.[\w.-]+)["']/g)].map((m) => m[1]))].slice(0, 20);
  const classNames = [...new Set([
    ...[...source.matchAll(/className\s*[:=]\s*["']([\w-]{3,40})["']/g)].map((m) => m[1]),
    ...[...source.matchAll(/\bclass\s*=\s*["']([\w-]{3,40})["']/g)].map((m) => m[1]),
  ])].slice(0, 20);
  const testIds = [...new Set([...source.matchAll(/data-testid["']?\s*[:=]\s*["']([\w-]{2,40})["']/g)].map((m) => m[1]))].slice(0, 20);
  const injectCalls = [...new Set([...source.matchAll(/\.inject\(\s*["']([^"']+)["']/g)].map((m) => m[1]))].slice(0, 20);

  const files = [];
  try {
    for (const f of readdirSync(pluginDir)) {
      const st = statSync(join(pluginDir, f));
      if (st.isFile() && /\.(js|mjs|cjs|yml|yaml)$/.test(f)) files.push({ file: f, bytes: st.size });
    }
  } catch {}

  return {
    ok: true,
    data: {
      pkg: pkgName, version: pkg.version || '', profile: profileDir,
      installed: true, inBundles, disabled,
      declaration: { engine: pkg.engines && pkg.engines.dsh, compatibility: dsh.compatibility || null, platform: (dsh.client && dsh.client.platform) || null },
      injects, patchFiles: patchFilesList.map((p) => p.split(/[\\/]/).slice(-1)[0]), patchRows: rows,
      entry: entry ? entry.split(/[\\/]/).slice(-2).join('/') : '',
      entryKind,
      entryNote: entry ? '' : '未声明客户端入口（可能是纯 host 插件，或入口在 bundle 里）',
      entryBytes: source.length,
      slotKeys, classNames, testIds, injectCalls, files,
      head: source ? source.split(/\r?\n/).slice(0, lines) : [],
    },
  };
}
