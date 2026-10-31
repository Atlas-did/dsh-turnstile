#!/usr/bin/env node
// A3：实验前拍一张快照，坏了秒回滚。
//
// 只备份「决定能不能启动」的三样：package.json、cordis.patch.yml、compatibility.json。
// 记录放在 <stateDir>/snapshots/<时间戳>/，附一份 manifest 说明每张快照是什么时候、为什么拍的。
//
// usage:
//   node tools/sandbox-snapshot.mjs <profileDir> --take [--label 说明] [--state <dir>]
//   node tools/sandbox-snapshot.mjs <profileDir> --list
//   node tools/sandbox-snapshot.mjs <profileDir> --restore <name|latest>
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
if (!dir) { console.error('usage: node tools/sandbox-snapshot.mjs <profileDir> --take|--list|--restore <name> [--label 说明] [--state <dir>]'); process.exit(2); }
if (!existsSync(join(dir, 'package.json'))) { console.error('not a profile: ' + dir); process.exit(2); }

const FILES = ['package.json', 'cordis.patch.yml', 'compatibility.json'];
const stateDir = val('--state') || process.env.DSH_TURNSTILE_STATE || join(dir, '..', '..', 'turnstile-state');
const root = join(stateDir, 'snapshots');
const profileName = basename(dir);

function listSnaps() {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((n) => n.startsWith(profileName + '@')).sort();
}

if (has('--list')) {
  const rows = listSnaps();
  if (!rows.length) { console.log('还没有快照（第一次用 --take）'); process.exit(0); }
  for (const name of rows) {
    let meta = {};
    try { meta = JSON.parse(readFileSync(join(root, name, 'snapshot.json'), 'utf8')); } catch {}
    console.log(name + '   ' + (meta.label || '(无说明)') + '   ' + (meta.at || ''));
  }
  process.exit(0);
}

if (has('--restore')) {
  const want = val('--restore');
  const rows = listSnaps();
  const name = want === 'latest' ? rows[rows.length - 1] : want;
  if (!name || !rows.includes(name)) { console.error('找不到快照：' + want + '\n可用：' + (rows.join(', ') || '(无)')); process.exit(3); }
  const src = join(root, name);
  const stamp = Date.now();
  for (const f of FILES) {
    const from = join(src, f);
    if (!existsSync(from)) continue;
    const to = join(dir, f);
    if (existsSync(to)) copyFileSync(to, to + '.before-restore-' + stamp);
    copyFileSync(from, to);
  }
  console.log('已回滚到 ' + name + '（恢复前的文件留了 .before-restore-' + stamp + '）');
  process.exit(0);
}

// --take
const label = val('--label') || '手动快照';
const at = new Date().toISOString();
const name = profileName + '@' + at.replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(root, name);
mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const f of FILES) {
  const from = join(dir, f);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(outDir, f));
  copied += 1;
}
writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify({ profile: profileName, at, label, files: copied }, null, 2) + '\n');
console.log('快照 ' + name + '（' + copied + ' 个文件）');
process.exitCode = copied ? 0 : 3;
