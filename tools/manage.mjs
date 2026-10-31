#!/usr/bin/env node
// Manage one profile's plugin set: list, enable, disable.
// Row ids come from each plugin's own bundle patch (id + name pairs), so a toggle writes the
// exact row the loader reads instead of guessing from the package name.
// usage: node tools/manage.mjs <profileDir> [--list] [--disable <pkg>] [--enable <pkg>] [--yes]
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility } from './version.mjs';
import { loadYaml } from './config.mjs';
import { safeWritePatch } from './lib/patch-write.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const doDisable = flag('--disable');
const doEnable = flag('--enable');
const consumed = new Set([doDisable, doEnable].filter(Boolean));
// Auto-detect instead of assuming "desktop": use the only profile that exists, else a
// documented preference order. A phone install calls its profile "web", for example.
function detectProfile() {
  const home = process.env.DSH_HOME || '';
  const bases = [home, join(home, '..')].filter(Boolean);
  for (const base of bases) {
    const dir = join(base, 'profiles');
    if (!existsSync(dir)) continue;
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    const withPkg = names.filter((n) => existsSync(join(dir, n, 'package.json')));
    if (withPkg.length === 1) return join(dir, withPkg[0]);
    for (const pref of ['web', 'desktop', 'mini']) if (withPkg.includes(pref)) return join(dir, pref);
  }
  return (process.env.DSH_HOME || '') + '/profiles/desktop';
}
const profile = argv.find((a) => !a.startsWith('--') && !consumed.has(a)) || detectProfile();
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
  // `dsh.bundle.patch` may be a single path or an array of them (the built-in bundles use arrays).
  const rels = Array.isArray(rel) ? rel : (rel ? [rel] : []);
  for (const relOne of rels) {
    const pf = join(d, String(relOne).replace(/^\.\//, ''));
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

/**
 * --menu : a small interactive front-end over the same data model a UI would use.
 * Reads line commands so it works both on a TTY and through a pipe (which is how it is tested):
 *   t <n>  toggle row n (no file write yet)     s  save pending toggles     q  quit
 */
async function menuMode() {
  const { createInterface } = await import('node:readline');
  const pending = new Map(); // row id -> true (disable) / false (enable)
  const paint = () => {
    console.log('');
    console.log('  mini plugin set · ' + profile);
    console.log('  ' + '─'.repeat(64));
    rows.forEach((r, i) => {
      const wantOff = pending.has(r.ids[0]) ? pending.get(r.ids[0]) : r.disabled;
      const mark = wantOff ? '[ ]' : '[x]';
      const warn = (r.engineSkipped ? ' ENGINE-SKIP' : '') + (r.missing ? ' NOT-INSTALLED' : '');
      console.log('  ' + String(i + 1).padStart(2) + '. ' + mark + ' ' + String(r.name).padEnd(32) + (r.ids[0] || '-') + warn);
    });
    console.log('  ' + '─'.repeat(64));
    console.log('  t <n> 切换   s 保存   q 退出' + (pending.size ? '   (待保存 ' + pending.size + ' 项)' : ''));
  };
  paint();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  for await (const line of rl) {
    const cmd = line.trim();
    if (!cmd) continue;
    if (cmd === 'q') break;
    if (cmd === 's') {
      if (!pending.size) { console.log('  没有待保存的改动'); continue; }
      let next = patchText;
      for (const [rowId, off] of pending) next = toggleInPatch(next, rowId, off);
      safeWritePatch(patchPath, next);
      console.log('  已写入 ' + pending.size + ' 项，备份已留。重启 DSH 生效。');
      pending.clear();
      continue;
    }
    const m = cmd.match(/^t\s+(\d+)$/);
    if (!m) { console.log('  看不懂：' + cmd); continue; }
    const idx = Number(m[1]) - 1;
    const row = rows[idx];
    if (!row || !row.ids.length) { console.log('  没有可切换的行'); continue; }
    const cur0 = pending.has(row.ids[0]) ? pending.get(row.ids[0]) : row.disabled;
    pending.set(row.ids[0], !cur0);
    paint();
  }
  rl.close();
  process.exit(0);
}

/** pure: return the patch text with row `rowId` disabled (off=true) or enabled (off=false) */
function toggleInPatch(text, rowId, off) {
  if (off) {
    const block = '- id: ' + rowId + '\n  disabled: true';
    // Idempotent: a row already disabled must not gain a second block (that was a real bug:
    // two clicks of "disable" produced two `- id: talk` entries and the file kept growing).
    const lines0 = text.split(/\r?\n/);
    const at = lines0.findIndex((l) => new RegExp('^-\\s*id:\\s*' + rowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(l));
    if (at !== -1) {
      let end = lines0.length;
      for (let i = at + 1; i < lines0.length; i++) { if (/^-\s/.test(lines0[i])) { end = i; break; } }
      const next = lines0.slice(0, at).concat(block.split('\n'), lines0.slice(end));
      return next.join('\n');
    }
    const emptyRe = /^\[\]\s*$/m;
    return emptyRe.test(text) ? text.replace(emptyRe, block) : text.replace(/\s*$/, '') + '\n' + block + '\n';
  }
  const lines = text.split(/\r?\n/);
  const out = [];
  let dropping = false;
  for (const line of lines) {
    const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
    if (m) dropping = m[1] === rowId;
    else if (/^\S/.test(line)) dropping = false;
    if (dropping) continue;
    out.push(line);
  }
  let next = out.join('\n');
  if (!/^- /m.test(next)) next = next.replace(/\s*$/, '\n') + '[]\n';
  return next;
}

if (argv.includes('--menu')) { await menuMode(); }

if (argv.includes('--json')) {
  console.log(JSON.stringify({ profile, rows: rows.map((r) => ({ name: r.name, version: r.version, row: r.ids[0] || '', disabled: r.disabled, engineSkipped: r.engineSkipped, missing: r.missing })) }, null, 2));
  process.exit(0);
}

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

try {
  safeWritePatch(patchPath, next);
} catch (e) {
  console.error(String(e.message));
  process.exit(1);
}
console.log((doDisable ? 'disabled ' : 'enabled ') + target + '  (row ' + id + ')');
console.log('备份已写；生效需要重启 DSH。');