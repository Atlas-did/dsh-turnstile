#!/usr/bin/env node
// 文件变更监听（轮询实现，不假装是 ReadDirectoryChangesW）。
//
// 为什么先轮询：ReadDirectoryChangesW 需要 P/Invoke 或原生模块，而轮询能在纯 Node 里稳定工作，
// 对「profile 被改了就刷新」这个场景（几百个文件）足够；等确实需要毫秒级再换。
//
// usage: node tools/watch-changes.mjs <dir> [--interval 800] [--duration 10] [--once] [--json]
// 输出：每行一个事件 JSON  {at, path, event: added|changed|removed, size, mtime}
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
if (!dir) { console.error('usage: node tools/watch-changes.mjs <dir> [--interval 800] [--duration 10] [--once] [--json]'); process.exit(2); }

const interval = Number(val('--interval') || 800);
const duration = Number(val('--duration') || 0);
const json = has('--json') || true; // 默认就是 JSONL，方便管道

function snapshot(root, base = root, acc = new Map()) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(root, entry.name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { snapshot(full, base, acc); continue; }
    acc.set(relative(base, full).replace(/\\/g, '/'), { size: st.size, mtime: Math.floor(st.mtimeMs) });
  }
  return acc;
}

let prev = snapshot(dir);
const started = Date.now();
let emitted = 0;

const tick = () => {
  const now = snapshot(dir);
  const at = new Date().toISOString();
  const emit = (path, event, meta) => {
    emitted += 1;
    process.stdout.write(JSON.stringify({ at, path, event, size: meta ? meta.size : 0, mtime: meta ? meta.mtime : 0 }) + '\n');
  };
  for (const [path, meta] of now) {
    const old = prev.get(path);
    if (!old) emit(path, 'added', meta);
    else if (old.mtime !== meta.mtime || old.size !== meta.size) emit(path, 'changed', meta);
  }
  for (const path of prev.keys()) if (!now.has(path)) emit(path, 'removed', null);
  prev = now;
};

if (has('--once')) { tick(); process.exit(0); }

process.stderr.write('监听 ' + dir + '（每 ' + interval + 'ms 轮询' + (duration ? '，' + duration + 's 后停' : '') + '）\n');
const timer = setInterval(tick, interval);
if (duration > 0) {
  setTimeout(() => {
    clearInterval(timer);
    process.stderr.write('结束，共 ' + emitted + ' 个事件\n');
    process.exit(0);
  }, duration * 1000);
}
