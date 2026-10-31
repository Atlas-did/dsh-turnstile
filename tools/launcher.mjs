#!/usr/bin/env node
// Everything 式启动器的 CLI 版：建索引 / 搜 / 打开。
//
// usage:
//   node tools/launcher.mjs index --root <dir> [--out <file>] [--max 20000]
//   node tools/launcher.mjs search --q "dsh" [--index <file>] [--limit 20]
//   node tools/launcher.mjs open --path <file>
//
// 索引是 JSON：{root, builtAt, count, entries:[{path, name, size, mtime}]}。
// 首次全量；之后可以用同样的命令做增量（只补新增/改动，见 --incremental）。
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { searchIndex, shouldSkip } from '../plugins/turnstile-popup/lib/launcher-index.js';

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) || 'search';
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const stateDir = process.env.DSH_TURNSTILE_STATE || '.';
const indexPath = val('--index') || join(stateDir, 'launcher-index.json');

if (cmd === 'index') {
  const root = val('--root');
  if (!root || !existsSync(root)) { console.error('index 需要 --root <存在的目录>'); process.exit(2); }
  const max = Number(val('--max') || 20000);
  const entries = [];
  const started = Date.now();
  let skipped = 0;
  const walk = (dir, depth) => {
    if (entries.length >= max) return;
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      if (entries.length >= max) return;
      if (shouldSkip(d.name)) { skipped += 1; continue; }
      const full = join(dir, d.name);
      if (d.isDirectory()) { if (depth < 12) walk(full, depth + 1); continue; }
      let st;
      try { st = statSync(full); } catch { continue; }
      entries.push({ path: full, name: d.name, size: st.size, mtime: Math.floor(st.mtimeMs) });
    }
  };
  walk(root, 0);
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify({ root, builtAt: new Date().toISOString(), count: entries.length, skippedDirs: skipped, entries }, null, 0));
  console.log('索引完成 ' + entries.length + ' 条（跳过 ' + skipped + ' 个目录）· ' + (Date.now() - started) + 'ms · ' + indexPath);
  process.exit(0);
}

if (cmd === 'search') {
  const q = val('--q') || '';
  if (!existsSync(indexPath)) { console.error('还没有索引：先 node tools/launcher.mjs index --root <dir>'); process.exit(3); }
  const data = JSON.parse(readFileSync(indexPath, 'utf8'));
  const hits = searchIndex(data.entries, q, { limit: Number(val('--limit') || 10) });
  if (has('--json')) { console.log(JSON.stringify({ query: q, count: hits.length, hits }, null, 1)); process.exit(0); }
  console.log('搜「' + q + '」→ ' + hits.length + ' 条（索引 ' + data.count + ' 条）');
  for (const h of hits) console.log('  ' + String(h.score).padStart(4) + '  ' + h.path);
  process.exit(0);
}

if (cmd === 'open') {
  const p = val('--path');
  if (!p) { console.error('open 需要 --path'); process.exit(2); }
  if (!existsSync(p)) { console.error('不存在：' + p); process.exit(3); }
  const { spawn } = await import('node:child_process');
  spawn('cmd', ['/c', 'start', '', p], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  console.log('已交给系统打开：' + p);
  process.exit(0);
}

console.error('usage: node tools/launcher.mjs index|search|open …');
process.exit(2);
