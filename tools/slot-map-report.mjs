#!/usr/bin/env node
// 每插件 × 每 slot 的分布表：回答「这个插件到底插了哪几个位置」。
//
// usage:
//   node tools/slot-map-report.mjs [--map <slot-map.json>] [--plugin dsh-better-sidebar] [--json]
//
// 数据来自页面自报的 slot-map（state/slot-map-<profile>.json）：
//   { slots: [ { slot, count, entries: [id...], declaredBy } ] }
// 归属规则与 ui-atlas 一致：entry id 以插件名开头（冒号 / 斜杠 / 点号三种写法）。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const wantJson = argv.includes('--json');
const only = val('--plugin');

function defaultMap() {
  const state = process.env.DSH_TURNSTILE_STATE || '';
  const profile = process.env.DSH_PROFILE || 'mini';
  return state ? join(state, 'slot-map-' + profile + '.json') : '';
}
const file = val('--map') || defaultMap();
if (!file || !existsSync(file)) {
  console.error('找不到 slot-map：' + (file || '(未指定)'));
  console.error('先让面板打开一次（页面会自动上报），或用 --map 指定文件');
  process.exit(3);
}

const data = JSON.parse(readFileSync(file, 'utf8'));
const slots = Array.isArray(data.slots) ? data.slots : [];

function belongs(entryId, plugin) {
  const s = String(entryId || '');
  const head = String(plugin).split('-')[0];
  return s === plugin || s.startsWith(plugin + ':') || s.startsWith(plugin + '/') || (head.length >= 6 && s.startsWith(head + '.'));
}

// 反推：每个 entry 属于谁？先按已知前缀法归到插件，归不上的记 (核心/未知)
const byPlugin = new Map();
for (const s of slots) {
  for (const id of s.entries || []) {
    const str = String(id || '');
    // 取前缀作为候选插件名：@scope/name 或 name:rest 或 name.rest
    let plugin = '(核心/未归属)';
    const scoped = /^(@[\w.-]+\/[\w.-]+)/.exec(str);
    if (scoped) plugin = scoped[1];
    else if (str.includes(':')) plugin = str.split(':')[0];
    else if (str.includes('.') && str.split('.')[0].length >= 6) plugin = str.split('.')[0];
    if (!byPlugin.has(plugin)) byPlugin.set(plugin, new Map());
    const m = byPlugin.get(plugin);
    if (!m.has(s.slot)) m.set(s.slot, []);
    m.get(s.slot).push(str);
  }
}

const rows = [...byPlugin.entries()].map(([plugin, slotsMap]) => ({
  plugin,
  total: [...slotsMap.values()].reduce((n, v) => n + v.length, 0),
  slots: [...slotsMap.entries()].map(([slot, ids]) => ({ slot, count: ids.length, entries: ids })).sort((a, b) => b.count - a.count),
})).sort((a, b) => b.total - a.total);

const filtered = only ? rows.filter((r) => belongs2(r.plugin, only)) : rows;
function belongs2(a, b) { return a === b || a.startsWith(b) || b.startsWith(a); }

if (wantJson) {
  console.log(JSON.stringify({ file, at: data.at || '', plugins: filtered }, null, 1));
  process.exit(0);
}

console.log('slot 分布 · ' + file);
if (data.at) console.log('  采集于 ' + data.at + ' · slot ' + slots.length + ' 个');
console.log('');
for (const r of filtered.slice(0, only ? 50 : 12)) {
  console.log(r.plugin + '  ·  ' + r.total + ' 条 · ' + r.slots.length + ' 个位置');
  for (const s of r.slots) {
    const sample = s.entries.slice(0, 3).join(', ') + (s.entries.length > 3 ? ' …' : '');
    console.log('    ' + String(s.count).padStart(3) + '  ' + s.slot + '   ' + sample);
  }
}
if (!filtered.length) console.log('（没有匹配的插件）');
