#!/usr/bin/env node
// A2：把沙盒里验过的改动 promote 到主 profile——先出清单，再决定要不要写。
//
// 只比较三样决定性的东西：dependencies、dsh.profile.bundles、cordis.patch.yml 的行。
// 默认 dry-run：打印「要改哪几处」；--apply 才写，且写前备份 + 写后校验。
//
// usage: node tools/sandbox-promote.mjs <sandboxProfile> <mainProfile> [--apply] [--json]
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from './config.mjs';
import { safeWritePatch } from './lib/patch-write.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const has = (n) => process.argv.includes(n);
const [src, dst] = args;
if (!src || !dst) { console.error('usage: node tools/sandbox-promote.mjs <sandboxProfile> <mainProfile> [--apply] [--json]'); process.exit(2); }
for (const d of [src, dst]) if (!existsSync(join(d, 'package.json'))) { console.error('not a profile: ' + d); process.exit(2); }

const readPkg = (d) => JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
const readPatch = (d) => { const p = join(d, 'cordis.patch.yml'); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const rowsOf = (text) => [...text.matchAll(/^\s*-?\s*id:\s*([\w.@/-]+)/gm)].map((m) => m[1]);

const a = readPkg(src), b = readPkg(dst);
const aDeps = a.dependencies || {}, bDeps = b.dependencies || {};
const aBundles = (a.dsh && a.dsh.profile && a.dsh.profile.bundles) || [];
const bBundles = (b.dsh && b.dsh.profile && b.dsh.profile.bundles) || [];
const newDeps = Object.keys(aDeps).filter((k) => !(k in bDeps));
const newBundles = aBundles.filter((n) => !bBundles.includes(n));
const aPatch = readPatch(src), bPatch = readPatch(dst);
const bRows = new Set(rowsOf(bPatch));
const newRows = rowsOf(aPatch).filter((r) => !bRows.has(r));

const changes = [
  ...newBundles.map((n) => ({ where: 'dsh.profile.bundles', item: n, action: '添加' })),
  ...newDeps.map((n) => ({ where: 'dependencies', item: n, value: aDeps[n], action: '添加' })),
  ...newRows.map((r) => ({ where: 'cordis.patch.yml', item: r, action: '追加行' })),
];

if (has('--json')) { console.log(JSON.stringify({ from: src, to: dst, changes, apply: has('--apply') }, null, 1)); process.exit(changes.length ? 0 : 0); }

console.log('promote · ' + src + '  →  ' + dst);
if (!changes.length) { console.log('没有差异：主 profile 已经是这个样子。'); process.exit(0); }
for (const c of changes) console.log('  · ' + c.action + ' ' + c.where + ' ← ' + c.item + (c.value ? '  (' + c.value + ')' : ''));

if (!has('--apply')) {
  console.log('');
  console.log('这是 dry-run。确认无误后加 --apply：会先备份 package.json / cordis.patch.yml，再写，并校验 YAML。');
  process.exit(0);
}

// 写：只做「加」，不删不改版本。
const next = JSON.parse(JSON.stringify(b));
next.dependencies = next.dependencies || {};
next.dsh = next.dsh || {}; next.dsh.profile = next.dsh.profile || {}; next.dsh.profile.bundles = next.dsh.profile.bundles || [];
for (const n of newBundles) if (!next.dsh.profile.bundles.includes(n)) next.dsh.profile.bundles.push(n);
for (const n of newDeps) next.dependencies[n] = aDeps[n];
const pkgPath = join(dst, 'package.json');
copyFileSync(pkgPath, pkgPath + '.bak-promote-' + Date.now());
writeFileSync(pkgPath, JSON.stringify(next, null, 2) + '\n');

const { yaml, schema } = loadYaml();
if (newRows.length) {
  const block = newRows.map((r) => '- id: ' + r).join('\n') + '\n';
  const base = bPatch.trim() ? bPatch.replace(/\s*$/, '') + '\n' : '[]\n';
  const merged = base === '[]\n' ? block : base + block;
  try { yaml.load(merged, { schema }); } catch (e) { console.error('合并后的 patch 不可解析，已放弃写入：' + String(e.message).slice(0, 120)); process.exit(1); }
  try { safeWritePatch(join(dst, 'cordis.patch.yml'), merged); } catch (e) { console.error(String(e.message)); process.exit(1); }
}
console.log('已写入 ' + changes.length + ' 处；重启主 DSH 生效。备份后缀 .bak-promote-*');
