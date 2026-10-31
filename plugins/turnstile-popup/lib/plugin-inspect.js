'use strict';
// 插件骨架的纯数据层：CLI（tools/inspect-plugin.mjs）与宿主路由（/turnstile/inspect）共用。
// 不打印、不 exit，只返回 { ok, data } 或 { ok:false, code, reason }。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// patch 文件可能是字符串也可能是数组（B1 那次的教训），本地实现一份最小版本，避免跨目录依赖。
function patchFiles(pluginDir, patch) {
  if (!patch) return [];
  const list = Array.isArray(patch) ? patch : [patch];
  return list.filter((p) => typeof p === 'string').map((p) => join(pluginDir, p.replace(/^\.\//, '')));
}

export function inspectPlugin(profileDir, pkgName, { lines = 40 } = {}) {
  if (!existsSync(join(profileDir, 'package.json'))) return { ok: false, code: 2, reason: 'not a profile: ' + profileDir };
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

  const candidates = ['lib/client.js', 'lib/client.mjs', 'dist/client.js', (dsh.client && dsh.client.entry) || ''].filter(Boolean);
  const entry = candidates.map((c) => join(pluginDir, c)).find((p) => existsSync(p)) || '';
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
      entryBytes: source.length,
      slotKeys, classNames, testIds, injectCalls, files,
      head: source ? source.split(/\r?\n/).slice(0, lines) : [],
    },
  };
}
