#!/usr/bin/env node
// 装前/装后对比：拍快照、和上一次比。回答「我装了插件之后，到底变了什么」。
//
// usage:
//   node tools/profile-snapshot.mjs <profileDir> --take [--label "装 xxx 之前"]
//   node tools/profile-snapshot.mjs <profileDir> --diff [--json]
//   node tools/profile-snapshot.mjs <profileDir> --list
//
// 快照内容（都是可复算的，不猜）：插件名/版本/是否停用/UI 面/配置行，UI 面计数，配置体积。
import { resolveStateDir } from './lib/state-root.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const argv = process.argv.slice(2);
const profile = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
if (!profile) { console.error('usage: node tools/profile-snapshot.mjs <profileDir> --take|--diff|--list [--json]'); process.exit(2); }
if (!existsSync(join(profile, 'package.json'))) { console.error('not a profile: ' + profile); process.exit(2); }

const stateDir = resolveStateDir({ explicit: val('--state'), profileDir: profile });
const snapDir = join(stateDir, 'snapshots');

function build() {
  const pkg = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const patchPath = join(profile, 'cordis.patch.yml');
  const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  const patchBytes = patchText.length;
  const rows = [];
  for (const m of patchText.matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) rows.push(m[1]);
  const plugins = [];
  const surfaces = new Map();
  for (const name of bundles) {
    const p = join(profile, 'node_modules', name, 'package.json');
    if (!existsSync(p)) { plugins.push({ name, version: '', missing: true, disabled: false, ui: [], rows: [] }); continue; }
    const meta = JSON.parse(readFileSync(p, 'utf8'));
    const dsh = meta.dsh || {};
    const ui = (dsh.client && dsh.client.inject) || [];
    for (const s of ui) surfaces.set(s, (surfaces.get(s) || 0) + 1);
    const disabled = new RegExp('id:\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n\\s*disabled:\\s*true').test(patchText);
    plugins.push({ name, version: meta.version || '', missing: false, disabled, ui });
  }
  // 适配卡也进快照：它决定这台机器怎么被适配，属于「回滚范围」（方案 186 §6.4）
  const provDir = join(stateDir, 'provision');
  const provFile = join(provDir, 'profile-' + (profile.split(/[\\/]/).pop() || '') + '.json');
  let provision = null;
  try {
    const card = JSON.parse(readFileSync(provFile, 'utf8'));
    provision = { cardDigest: card.cardDigest || '', machineDigest: card.machineDigest || '', stale: Boolean(card.stale && card.stale.isStale) };
  } catch { provision = null; }
  return {
    at: new Date().toISOString(),
    profile: profile.replace(/\\/g, '/'),
    provision,
    bundles: bundles.length,
    patchBytes,
    patchRows: rows,
    plugins,
    surfaces: [...surfaces.entries()].map(([surface, count]) => ({ surface, count })).sort((a, b) => b.count - a.count),
  };
}

if (has('--take')) {
  const snap = build();
  snap.label = val('--label') || '';
  mkdirSync(snapDir, { recursive: true });
  const file = join(snapDir, snap.at.replace(/[:.]/g, '-') + '.json');
  writeFileSync(file, JSON.stringify(snap, null, 1));
  if (has('--json')) {
    console.log(JSON.stringify({ ok: true, file, at: snap.at, label: snap.label, bundles: snap.bundles, surfaces: snap.surfaces.length, patchBytes: snap.patchBytes }, null, 2));
    process.exit(0);
  }
  console.log('快照已存 ' + file);
  console.log('  ' + snap.bundles + ' 个插件 · ' + snap.surfaces.length + ' 个 UI 面 · patch ' + snap.patchBytes + ' 字节' + (snap.label ? ' · ' + snap.label : ''));
  process.exit(0);
}

if (has('--list')) {
  if (!existsSync(snapDir)) { console.log('还没有快照（先 --take）'); process.exit(0); }
  const files = readdirSync(snapDir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(snapDir, f), 'utf8'));
    console.log('  ' + f.replace(/\.json$/, '') + '  ' + s.bundles + ' 插件 / ' + s.surfaces.length + ' 面' + (s.label ? '  ' + s.label : ''));
  }
  process.exit(0);
}

// --diff：和上一张比（至少两张）
if (!existsSync(snapDir)) { console.error('还没有快照：先 node tools/profile-snapshot.mjs <profile> --take'); process.exit(3); }
const files = readdirSync(snapDir).filter((f) => f.endsWith('.json')).sort();
if (files.length < 2) { console.error('只有一张快照，没法比：再 --take 一次'); process.exit(3); }
const before = JSON.parse(readFileSync(join(snapDir, files[files.length - 2]), 'utf8'));
const after = JSON.parse(readFileSync(join(snapDir, files[files.length - 1]), 'utf8'));

const names = (s) => new Set(s.plugins.map((p) => p.name));
const added = [...names(after)].filter((n) => !names(before).has(n));
const removed = [...names(before)].filter((n) => !names(after).has(n));
const surfaceDelta = [];
const beforeSurf = new Map(before.surfaces.map((s) => [s.surface, s.count]));
const afterSurf = new Map(after.surfaces.map((s) => [s.surface, s.count]));
for (const s of new Set([...beforeSurf.keys(), ...afterSurf.keys()])) {
  const b = beforeSurf.get(s) || 0;
  const a = afterSurf.get(s) || 0;
  if (a !== b) surfaceDelta.push({ surface: s, before: b, after: a, delta: a - b });
}
surfaceDelta.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

// 适配卡变化单独列出来：它可能没改任何插件，但改变了这台机器的适配方式
const provisionDelta = (() => {
  const b = before.provision || null;
  const a = after.provision || null;
  if (!b && !a) return null;
  if (!b || !a) return { before: b, after: a, changed: true, reason: b ? '卡片被删除' : '卡片被新增' };
  const changed = b.cardDigest !== a.cardDigest || b.machineDigest !== a.machineDigest;
  return { before: b, after: a, changed, reason: changed ? 'cardDigest 或 machineDigest 变化' : '' };
})();
const out = { before: files[files.length - 2], after: files[files.length - 1], added, removed, surfaceDelta, provisionDelta, patchBytes: { before: before.patchBytes, after: after.patchBytes } };
if (has('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

console.log('对比 ' + out.before.replace(/\.json$/, '') + ' → ' + out.after.replace(/\.json$/, ''));
console.log('  新增插件 ' + (added.length ? added.join(', ') : '无'));
console.log('  移除插件 ' + (removed.length ? removed.join(', ') : '无'));
if (surfaceDelta.length) {
  console.log('  UI 面变化');
  for (const d of surfaceDelta.slice(0, 10)) console.log('    ' + (d.delta > 0 ? '+' : '') + d.delta + '  ' + d.surface + '  (' + d.before + ' → ' + d.after + ')');
} else console.log('  UI 面变化 无');
if (provisionDelta && provisionDelta.changed) console.log('  适配卡变化 ' + (provisionDelta.reason || ''));
else console.log('  适配卡变化 无');
const db = after.patchBytes - before.patchBytes;
console.log('  配置体积 ' + (db >= 0 ? '+' : '') + db + ' 字节  (' + before.patchBytes + ' → ' + after.patchBytes + ')');
