'use strict';
// UI 面扫描的唯一实现：profile → 插件声明 → 面计数。
// 之前 ui-surfaces / occupancy / doctor / gate-map 各写一份，口径会漂移（同一个面数出不同插件数）。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchFiles } from './patch-files.mjs';

/**
 * 扫一个 profile：
 *   surfaces: Map<面名, string[]>（去重后的插件名）
 *   plugins:  [{ name, version, missing, disabled, injects, patchRows }]
 *   patchRows: profile 自己 patch 里的行 id（不属于任何插件）
 */
export function scanUi(profileDir, { onlyUiSurfaces = false } = {}) {
  const want = (s) => !onlyUiSurfaces || /ui-/.test(s);
  const pkgPath = join(profileDir, 'package.json');
  if (!existsSync(pkgPath)) return { ok: false, reason: 'not a profile: ' + profileDir };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const patchPath = join(profileDir, 'cordis.patch.yml');
  const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  const profileRows = [];
  for (const m of patchText.matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) profileRows.push(m[1]);

  const surfaces = new Map();
  const plugins = [];
  for (const name of bundles) {
    const dir = join(profileDir, 'node_modules', name);
    const pj = join(dir, 'package.json');
    if (!existsSync(pj)) { plugins.push({ name, version: '', missing: true, disabled: false, injects: [], patchRows: [] }); continue; }
    const meta = JSON.parse(readFileSync(pj, 'utf8'));
    const dsh = meta.dsh || {};
    const injects = (dsh.client && dsh.client.inject) || [];
    for (const s of injects) {
      if (!want(s)) continue;
      if (!surfaces.has(s)) surfaces.set(s, []);
      if (!surfaces.get(s).includes(name)) surfaces.get(s).push(name);
    }
    const rows = [];
    for (const f of patchFiles(dir, dsh.bundle && dsh.bundle.patch)) {
      if (!existsSync(f)) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(/^\s*-?\s*id:\s*([\w.@/-]+)/gm)) {
        rows.push(m[1]);
        // ui-surfaces 的老口径：patch 里 id 形如 ui-xxx 的行也算一个「面」
        if (onlyUiSurfaces && want(m[1])) {
          if (!surfaces.has(m[1])) surfaces.set(m[1], []);
          if (!surfaces.get(m[1]).includes(name)) surfaces.get(m[1]).push(name);
        }
      }
    }
    const disabled = new RegExp('id:\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n\\s*disabled:\\s*true').test(patchText);
    // 位置可配性：patch 里出现 slot/anchor/order 之一即认为可配（occupancy 的口径）
    let ownText = '';
    for (const f of patchFiles(dir, dsh.bundle && dsh.bundle.patch)) {
      if (existsSync(f)) ownText += readFileSync(f, 'utf8');
    }
    const configurable = /\b(slot|anchor|order)\s*:/.test(ownText);
    plugins.push({
      name, version: meta.version || '', missing: false, disabled, injects, patchRows: rows, configurable,
      pkgPath: pj.replace(/\\/g, '/'),
    });
  }

  return { ok: true, profile: profileDir, bundles: bundles.length, surfaces, plugins, profileRows };
}

/** 便捷：面 → 插件数，按数量降序。 */
export function surfaceCounts(scan) {
  return [...scan.surfaces.entries()]
    .map(([surface, list]) => ({ surface, count: list.length, plugins: list }))
    .sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));
}
