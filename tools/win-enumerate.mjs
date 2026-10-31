#!/usr/bin/env node
// 窗口/进程/句柄的稳定 JSON —— 回答用户第一句常问的「那个窗口是谁」。
//
// usage:
//   node tools/win-enumerate.mjs --processes [--filter <regex>] [--json]
//   node tools/win-enumerate.mjs --windows [--json]
//   node tools/win-enumerate.mjs --handles <pid>
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const wantJson = has('--json');

const ps = (script) => String(execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + script], { encoding: 'utf8', timeout: 60000 })).replace(/\uFEFF/g, '').trim();

if (has('--processes')) {
  const filter = val('--filter');
  const raw = ps("Get-Process | Select-Object Id,ProcessName,@{n='path';e={$_.Path}},@{n='ws';e={[int]($_.WorkingSet64/1MB)}} | ConvertTo-Json -Compress");
  let rows = JSON.parse(raw || '[]');
  if (!Array.isArray(rows)) rows = [rows];
  if (filter) { const rx = new RegExp(filter, 'i'); rows = rows.filter((r) => rx.test(r.ProcessName || '')); }
  const out = rows.map((r) => ({ pid: r.Id, name: r.ProcessName, memMB: r.ws, path: r.path || '' })).sort((a, b) => b.memMB - a.memMB);
  if (wantJson) { console.log(JSON.stringify({ count: out.length, processes: out }, null, 1)); process.exit(0); }
  console.log('进程 ' + out.length + ' 个（按内存降序）');
  for (const p of out.slice(0, 20)) console.log('  ' + String(p.pid).padStart(6) + '  ' + p.memMB + 'MB'.padEnd(5) + '  ' + p.name);
  process.exit(0);
}

if (has('--windows')) {
  const raw = String(execFileSync(process.execPath, [join(here, 'uia.mjs'), 'list', '--json'], { encoding: 'utf8', timeout: 60000 }));
  const data = JSON.parse(raw);
  const wins = data.items.map((w) => ({ title: w.name, pid: w.processId, class: w.className, offscreen: w.offscreen }));
  if (wantJson) { console.log(JSON.stringify({ count: wins.length, windows: wins }, null, 1)); process.exit(0); }
  console.log('顶层窗口 ' + wins.length + ' 个');
  for (const w of wins.slice(0, 20)) console.log('  ' + String(w.pid).padStart(6) + '  ' + (w.title || '(无名)').slice(0, 50));
  process.exit(0);
}

const pid = val('--handles');
if (pid) {
  // handle.exe 是 Sysinternals；不在就如实说缺器材，而不是假装没有句柄
  try {
    const out = String(execFileSync('handle.exe', ['-p', String(pid), '-nobanner'], { encoding: 'utf8', timeout: 60000 }));
    console.log(out.split('\n').slice(0, 40).join('\n'));
    process.exit(0);
  } catch (e) {
    console.error('拿不到句柄：handle.exe 不在 PATH（装 Sysinternals 后可用）');
    process.exit(3);
  }
}

console.error('usage: node tools/win-enumerate.mjs --processes|--windows|--handles <pid> [--filter rx] [--json]');
process.exit(2);
