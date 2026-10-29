#!/usr/bin/env node
// Manage one profile's plugin set: list, enable, disable.
// Row ids come from each plugin's own bundle patch (id + name pairs), so a toggle writes the
// exact row the loader reads instead of guessing from the package name.
// usage: node tools/manage.mjs <profileDir> [--list] [--disable <pkg>] [--enable <pkg>] [--yes]
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility } from './version.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const doDisable = flag('--disable');
const doEnable = flag('--enable');
const consumed = new Set([doDisable, doEnable].filter(Boolean));
const profile = argv.find((a) => !a.startsWith('--') && !consumed.has(a)) || ((process.env.DSH_HOME || '') + '/profiles/desktop');
const confirmed = argv.includes('--yes');

if (!existsSync(join(profile, 'package.json'))) { console.error('profile not found: ' + profile); process.exit(2); }
const pkg = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
const bundles = pkg.dsh?.profile?.bundles || [];
const deps = Object.keys(pkg.dependencies || {});
const patchPath = join(profile, 'cordis.patch.yml');
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m);

/** every row id a plugin's own bundle patch declares */
function rowIdsOf(name) {
  const d = join(profile, 'node_modules', name);
  const pj = join(d, 'package.json');
  if (!existsSync(pj)) return { missing: true, ids: [], version: '' };
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const ids = [];
  const rel = j.dsh?.bundle?.patch;
  if (rel) {
    const pf = join(d, rel.replace(/^\.\//, ''));
    if (existsSync(pf)) {
      const t = readFileSync(pf, 'utf8');
      const pairRe = /-\s*id:\s*([\w.@/-]+)\s*\n\s*name:\s*['\"]([^'\"]+)['\"]/g;
      let m;
      while ((m = pairRe.exec(t))) {
        if (m[2] === name || m[2].startsWith(name + '/')) ids.push(m[1]);
      }
      if (!ids.length) {
        const anyRe = /-\s*id:\s*([\w.@/-]+)/g;
        let m2; while ((m2 = anyRe.exec(t))) ids.push(m2[1]);
      }
    }
  }
  return { missing: false, ids, version: j.version, manifest: j };
}

/** Parse the profile patch into row blocks once; a row is disabled when its block says so. */
const patchBlocks = (() => {
  const map = new Map();
  let curId = null, buf = [];
  const flush = () => { if (curId) map.set(curId, buf.join('\n')); };
  for (const line of patchText.split(/\r?\n/)) {
    const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
    if (m) { flush(); curId = m[1]; buf = [line]; continue; }
    if (/^\S/.test(line) && !m) { flush(); curId = null; buf = []; continue; }
    if (curId) buf.push(line);
  }
  flush();
  return map;
})();

function isDisabled(rowId) {
  const block = patchBlocks.get(rowId);
  return Boolean(block && /^\s*disabled:\s*true\s*$/m.test(block));
}
const managed = bundles.filter((b) => !b.startsWith('@deepseek-ai/'));
const rows = managed.map((name) => {
  const r = rowIdsOf(name);
  const disabledIds = r.ids.filter(isDisabled);
  const issue = r.missing ? null : checkCompatibility(r.manifest);
  return {
    name, version: r.version, ids: r.ids, missing: r.missing,
    disabled: disabledIds.length > 0, disabledIds,
    engineSkipped: Boolean(issue),
  };
});

if (!doDisable && !doEnable) {
  console.log('profile: ' + profile);
  console.log('bundles ' + bundles.length + '  (runtime-provided ' + (bundles.length - managed.length) + ', managed ' + managed.length + ')   deps ' + deps.length);
  console.log('停用 ' + rows.filter((r) => r.disabled).length + '   引擎跳过 ' + rows.filter((r) => r.engineSkipped).length + '   未安装 ' + rows.filter((r) => r.missing).length);
  console.log('');
  console.log('STATUS'.padEnd(16) + 'PLUGIN'.padEnd(34) + 'ROW IDS');
  for (const r of rows) {
    const flags = [r.disabled ? 'DISABLED' : 'on', r.engineSkipped ? 'ENGINE-SKIP' : '', r.missing ? 'NOT-INSTALLED' : ''].filter(Boolean).join(' ');
    console.log(flags.padEnd(16) + String(r.name).padEnd(34) + (r.ids[0] || '(' + (r.missing ? 'no manifest' : 'no row') + ')'));
  }
  console.log('');
  console.log('用法: --disable <pkg> | --enable <pkg>   加 --yes 才写文件');
  process.exit(0);
}

const target = doDisable || doEnable;
const row = rows.find((r) => r.name === target);
if (!row) { console.error('not in this profile: ' + target); process.exit(3); }
if (!row.ids.length) { console.error('refusing: no row id found for ' + target); process.exit(4); }
const id = row.ids[0];

let next = patchText;
if (doDisable) {
  if (row.disabled) { console.log(target + ' 已经停用 (' + row.disabledIds.join(',') + ')'); process.exit(0); }
  // A profile patch that is an empty flow array (`[]`) cannot also hold block items;
  // replacing the sentinel keeps the file valid YAML.
  const emptyRe = /^\[\]\s*$/m;
  const rowBlock = '- id: ' + id + '\n  disabled: true';
  next = emptyRe.test(patchText)
    ? patchText.replace(emptyRe, rowBlock)
    : patchText.replace(/\s*$/, '') + '\n' + rowBlock + '\n';
} else {
  const lines = patchText.split(/\r?\n/);
  const out = [];
  let dropping = false;
  for (const line of lines) {
    const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
    if (m) dropping = (m[1] === id);
    else if (/^\S/.test(line)) dropping = false;
    if (dropping && /^\s*disabled:\s*true\s*$/.test(line)) continue;
    if (dropping && m) { /* keep the - id line? drop the whole block */ }
    if (!dropping) out.push(line);
  }
  next = out.join('\n');
  // keep the file a valid, self-describing empty patch
  if (!/^- /m.test(next)) next = next.replace(/\s*$/, '\n') + '[]\n';
}

if (!confirmed) {
  console.log('DRY RUN — 会写 ' + patchPath);
  console.log('  ' + (doDisable ? '追加 - id: ' + id + ' / disabled: true' : '删除 - id: ' + id + ' / disabled: true'));
  console.log('  加 --yes 才执行');
  process.exit(0);
}

copyFileSync(patchPath, patchPath + '.bak-' + Date.now());
writeFileSync(patchPath, next);
console.log((doDisable ? 'disabled ' : 'enabled ') + target + '  (row ' + id + ')');
console.log('备份已写；生效需要重启 DSH。');