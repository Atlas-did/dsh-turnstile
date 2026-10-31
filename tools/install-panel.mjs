#!/usr/bin/env node
// B13/B14: 把面板装进一个 profile，并且保证装完那个 profile **仍然能启动**。
//
// 之前的实现有三处错：
//   1. 往模板默认的 `[]` 后面直接追加 `- insert:` → 非法 YAML，宿主起不来；
//   2. 依赖写成 `link:`，过不了本工具自己的 dependency-risk 门禁；
//   3. 写完不校验，坏了也报成功。
//
// usage: node tools/install-panel.mjs <profileDir> <pluginSrc>
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadYaml } from './config.mjs';

export const PANEL_ID = 'turnstile-popup';

export function mergePatch(existing, yaml) {
  const text = String(existing || '');
  if (new RegExp('id:\\s*' + PANEL_ID).test(text)) return text;
  const block = '- insert:\n    - id: ' + PANEL_ID + '\n      name: ' + PANEL_ID + '\n';
  let parsed;
  try { parsed = yaml.load(text, {}); } catch { throw new Error('现有 cordis.patch.yml 无法解析，先修好再装'); }
  const empty = parsed === null || parsed === undefined || (Array.isArray(parsed) && parsed.length === 0);
  if (empty) return block;
  return text.replace(/\s*$/, '') + '\n' + block;
}

export function installPanel(profileDir, pluginSrc) {
  const { yaml, schema } = loadYaml();
  const dst = join(profileDir, 'node_modules', PANEL_ID);
  mkdirSync(dirname(dst), { recursive: true });
  rmSync(dst, { recursive: true, force: true });
  cpSync(pluginSrc, dst, { recursive: true });

  const pkgPath = join(profileDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies[PANEL_ID] = 'file:./node_modules/' + PANEL_ID;
  pkg.dsh = pkg.dsh || {};
  pkg.dsh.profile = pkg.dsh.profile || {};
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
  if (!pkg.dsh.profile.bundles.includes(PANEL_ID)) pkg.dsh.profile.bundles.push(PANEL_ID);

  const patchPath = join(profileDir, 'cordis.patch.yml');
  const oldPatch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '[]\n';
  const nextPatch = mergePatch(oldPatch, { load: (t) => yaml.load(t, { schema }) });
  try { yaml.load(nextPatch, { schema }); } catch (e) { throw new Error('写出的 patch 不可解析：' + String(e.message).slice(0, 120)); }

  const stamp = Date.now();
  copyFileSync(pkgPath, pkgPath + '.bak-' + stamp);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  copyFileSync(patchPath, patchPath + '.bak-' + stamp);
  writeFileSync(patchPath, nextPatch);
  return { dst, patchPath, pkgPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, srcArg] = process.argv.slice(2);
  if (!dir || !srcArg) { console.error('usage: node tools/install-panel.mjs <profileDir> <pluginSrc>'); process.exit(2); }
  try {
    const r = installPanel(dir, srcArg);
    console.log('panel installed into ' + r.dst + ' (restart DSH to load it)');
  } catch (e) {
    console.error('panel install failed: ' + String(e.message).slice(0, 300));
    process.exit(1);
  }
}
