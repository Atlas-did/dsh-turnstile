#!/usr/bin/env node
// Promote lab changes from mini to the main profile - as a readable plan, never by dragging in
// the live environment. The user reads the list, the agent explains it, then --apply copies it.
// usage: node tools/promote.mjs --from <miniProfile> --to <desktopProfile> [--apply] [--json]
import { readFileSync, existsSync, writeFileSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const from = val('--from');
const to = val('--to');
const apply = argv.includes('--apply');
const asJson = argv.includes('--json');
if (!from || !to) { console.error('usage: node tools/promote.mjs --from <miniProfile> --to <desktopProfile> [--apply] [--json]'); process.exit(2); }
for (const p of [from, to]) if (!existsSync(join(p, 'package.json'))) { console.error('not a profile: ' + p); process.exit(2); }

const readProfile = (dir) => {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const patchPath = join(dir, 'cordis.patch.yml');
  const blocks = new Map();
  if (existsSync(patchPath)) {
    for (const b of readFileSync(patchPath, 'utf8').split(/^\s*-\s*id:/m).slice(1)) {
      const id = (b.match(/^\s*([\w.@/-]+)/) || [])[1] || '';
      if (!id) continue;
      blocks.set(id, {
        disabled: /^\s*disabled:\s*true\s*$/m.test(b),
        anchor: (b.match(/^\s*anchor:\s*([\w.:-]+)\s*$/m) || [])[1] || null,
      });
    }
  }
  return { dir, bundles, blocks, has: (n) => bundles.indexOf(n) !== -1 };
};

const A = readProfile(from);
const B = readProfile(to);

// Baseline mode: a lab session starts by snapshotting mini, so "what did I change" is a diff
// against that snapshot - not against whatever the main profile happens to contain.
const baselinePath = val('--baseline') || join(from, 'turnstile-lab-baseline.json');
if (argv.includes('--snapshot')) {
  writeFileSync(baselinePath, JSON.stringify({ at: new Date().toISOString(), bundles: A.bundles, blocks: Object.fromEntries(A.blocks) }, null, 2) + '\n');
  console.log('baseline written: ' + baselinePath);
  process.exit(0);
}
const thirdParty = (n) => n.indexOf('@deepseek-ai/') !== 0;

const plan = [];
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
if (baseline) {
  const before = new Set(baseline.bundles || []);
  for (const pkg of A.bundles.filter(thirdParty)) {
    if (!before.has(pkg)) plan.push({ kind: 'add-bundle', package: pkg, detail: '本次实验新装' });
  }
  for (const [row, a] of A.blocks) {
    const b = (baseline.blocks || {})[row];
    if (!b) { plan.push({ kind: 'new-row', row, detail: pkgOf(row) }); continue; }
    if (a.disabled !== b.disabled) plan.push({ kind: 'toggle', row, to: a.disabled, detail: pkgOf(row) });
    if (a.anchor !== b.anchor) plan.push({ kind: 'anchor', row, from: b.anchor, to: a.anchor, detail: pkgOf(row) });
  }
} else {
for (const pkg of A.bundles.filter(thirdParty)) {
  if (!B.has(pkg)) plan.push({ kind: 'add-bundle', package: pkg, detail: '仅存在于 ' + from });
}
for (const [row, a] of A.blocks) {
  const b = B.blocks.get(row);
  if (!b) continue;
  if (a.disabled !== b.disabled) plan.push({ kind: 'toggle', row, from: a.disabled, to: a.disabled, detail: pkgOf(row) });
  if (a.anchor !== b.anchor) plan.push({ kind: 'anchor', row, from: a.anchor, to: a.anchor, detail: pkgOf(row) });
}
}
function pkgOf(row) {
  for (const pkg of A.bundles) if (row === pkg || row.indexOf(pkg.split('/').pop()) === 0) return pkg;
  return row;
}

if (asJson) console.log(JSON.stringify({ from, to, plan }, null, 2));
else {
  console.log('mini (实验场): ' + from);
  console.log('主环境       : ' + to);
  console.log('');
  if (!plan.length) console.log('两边一致，没有需要回流的改动。');
  else {
    console.log('改动清单（' + plan.length + ' 项）:');
    for (const it of plan) {
      if (it.kind === 'add-bundle') console.log('  + 新增插件   ' + it.package);
      if (it.kind === 'toggle') console.log('  ~ 停用状态   ' + it.detail + '  → ' + (it.to ? '停用' : '启用'));
      if (it.kind === 'anchor') console.log('  ~ 位置       ' + it.detail + '  ' + (it.from || '(未设)') + ' → ' + (it.to || '(未设)'));
    }
  }
  console.log('');
  if (!apply) { console.log('DRY RUN — 确认后加 --apply（每步留 .bak，可回滚）。'); process.exit(0); }
}

if (!apply) process.exit(0);
// Apply: only the unambiguous parts (bundles + anchors) are automated; toggles need review.
let applied = 0, skipped = 0;
const pkgPath = join(to, 'package.json');
const doc = JSON.parse(readFileSync(pkgPath, 'utf8'));
doc.dsh = doc.dsh || {}; doc.dsh.profile = doc.dsh.profile || {}; doc.dsh.profile.bundles = doc.dsh.profile.bundles || [];
for (const it of plan) {
  if (it.kind === 'add-bundle') {
    const srcDir = join(from, 'node_modules', it.package);
    const dstDir = join(to, 'node_modules', it.package);
    if (!existsSync(srcDir)) { skipped++; continue; }
    cpSync(srcDir, dstDir, { recursive: true });
    doc.dependencies = doc.dependencies || {};
    doc.dependencies[it.package] = 'link:' + dstDir;
    if (doc.dsh.profile.bundles.indexOf(it.package) === -1) doc.dsh.profile.bundles.push(it.package);
    applied++;
  } else { skipped++; }
}
if (applied) { copyFileSync(pkgPath, pkgPath + '.bak-' + Date.now()); writeFileSync(pkgPath, JSON.stringify(doc, null, 2) + '\n'); }
console.log('applied ' + applied + ', needs manual review ' + skipped + ' (停用状态/位置请用 manage.mjs / anchor.mjs 逐条确认)');
