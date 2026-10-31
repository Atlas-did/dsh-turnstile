#!/usr/bin/env node
// A4：实验记录。每次「装了什么、结论如何、耗时多少」留一行，可导出成 issue / 复测清单。
//
// 存 <stateDir>/lab-journal.jsonl（一行一条，永不改写历史）。
//
// usage:
//   node tools/lab-journal.mjs --add --kind trial --target dsh-x --verdict pass --note "重启后 11/11"
//   node tools/lab-journal.mjs --list [--last 10]
//   node tools/lab-journal.mjs --export issue.md
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const stateDir = process.env.DSH_TURNSTILE_STATE || '.';
const file = join(stateDir, 'lab-journal.jsonl');

const read = () => existsSync(file)
  ? readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { broken: l }; } })
  : [];

if (has('--add')) {
  const entry = {
    at: new Date().toISOString(),
    kind: val('--kind') || 'note',
    target: val('--target') || '',
    verdict: val('--verdict') || 'unknown',
    note: val('--note') || '',
  };
  if (!entry.target && !entry.note) { console.error('至少给 --target 或 --note'); process.exit(2); }
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + '\n');
  console.log('已记录：' + entry.kind + ' · ' + (entry.target || '(无目标)') + ' · ' + entry.verdict);
  process.exit(0);
}

const rows = read();
if (has('--list')) {
  const last = Number(val('--last') || 0) || rows.length;
  const slice = rows.slice(-last);
  if (!slice.length) console.log('还没有实验记录（用 --add 写第一条）');
  for (const r of slice) {
    if (r.broken) { console.log('?? 损坏行：' + String(r.broken).slice(0, 60)); continue; }
    console.log((r.at || '').slice(0, 19).replace('T', ' ') + '  ' + String(r.kind).padEnd(7) + String(r.verdict).padEnd(8) + (r.target || '') + (r.note ? '  — ' + r.note : ''));
  }
}

const out = val('--export');
if (out) {
  const lines = ['# 实验记录（导出 ' + new Date().toISOString().slice(0, 19) + '）', '', '| 时间 | 类型 | 目标 | 结论 | 备注 |', '|---|---|---|---|---|'];
  for (const r of rows) {
    if (r.broken) continue;
    lines.push('| ' + (r.at || '').slice(0, 19).replace('T', ' ') + ' | ' + r.kind + ' | ' + (r.target || '') + ' | ' + r.verdict + ' | ' + (r.note || '') + ' |');
  }
  lines.push('', '共 ' + rows.length + ' 条；来源 ' + file);
  writeFileSync(out, lines.join('\n') + '\n');
  console.log('已导出 ' + out + '（' + rows.length + ' 条）');
}
process.exit(0);
