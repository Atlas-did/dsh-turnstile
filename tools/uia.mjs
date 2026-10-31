#!/usr/bin/env node
// UIA 的 Node 薄封装：把 PowerShell + UIAutomationClient 的输出变成稳定 JSON。
//
// 为什么用 PowerShell 后端：这台机器上 UI Automation 的 .NET 组件已在（windows-probe 验证过），
// 而 Node 直连 UIA 需要额外原生模块；先用「零安装」的路径把能力跑通，后面再谈性能。
//
// 只做**读**：列窗口 / 读控件树 / 按名字找 / 取当前焦点文本。操作类（点、输入）必须走能力网关（goal 第②步）。
//
// usage:
//   node tools/uia.mjs list [--json]
//   node tools/uia.mjs tree [--depth 3] [--pid 1234] [--max 200] [--json]
//   node tools/uia.mjs find --name <精确名字> [--json]
//   node tools/uia.mjs text [--json]
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'uia.ps1');
const argv = process.argv.slice(2);
const action = argv.find((a) => !a.startsWith('--')) || 'list';
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const wantJson = argv.includes('--json');

const ALLOWED = new Set(['list', 'tree', 'find', 'text']);
if (!ALLOWED.has(action)) { console.error('usage: node tools/uia.mjs <list|tree|find|text> [--depth n] [--pid n] [--name x] [--json]'); process.exit(2); }

const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action];
const depth = val('--depth'); if (depth) args.push('-Depth', depth);
const pid = val('--pid'); if (pid) args.push('-TargetPid', pid);
const max = val('--max'); if (max) args.push('-Max', max);
const name = val('--name'); if (name) args.push('-Name', name);

let raw = '';
let failed = null;
try {
  raw = String(execFileSync('powershell', args, { encoding: 'utf8', timeout: 60000 }));
} catch (e) {
  failed = String((e.stdout || '') + (e.stderr || '')).replace(/\uFEFF/g, '');
}
const text = raw.replace(/\uFEFF/g, '').trim();
if (!text) {
  console.error('UIA 没有返回内容' + (failed ? '：' + failed.split('\n')[0].slice(0, 120) : ''));
  process.exit(3);
}
let data;
try { data = JSON.parse(text); } catch (e) {
  console.error('UIA 输出不是 JSON：' + text.slice(0, 160));
  process.exit(3);
}
if (!Array.isArray(data)) data = data ? [data] : [];

if (wantJson) { console.log(JSON.stringify({ action, count: data.length, items: data }, null, 1)); process.exit(0); }

if (action === 'list') {
  console.log('顶层窗口 ' + data.length + ' 个');
  for (const w of data) console.log('  ' + String(w.processId).padStart(6) + '  ' + (w.name || '(无名)').slice(0, 48) + '  [' + w.className + ']');
} else if (action === 'tree') {
  console.log('控件树 ' + data.length + ' 个节点');
  for (const n of data) console.log('  ' + '  '.repeat(n.level || 0) + n.type + (n.name ? ' · ' + String(n.name).slice(0, 40) : '') + '  pid=' + n.processId);
} else if (action === 'find') {
  console.log('匹配 ' + data.length + ' 个');
  for (const n of data) console.log('  ' + n.type + ' · ' + (n.name || '') + '  pid=' + n.processId + '  id=' + n.automationId);
} else {
  const one = data[0] || {};
  console.log('焦点：' + (one.focused ? one.focused.type + ' · ' + (one.focused.name || '') : '未知'));
  console.log('文本：' + (one.value || '(空)'));
}
