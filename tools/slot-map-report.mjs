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
import { groupByPlugin, belongsTo, diffSlotMaps, CORE } from './lib/slot-attr.mjs';

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

// --against：和另一份快照比「哪个 slot 多了谁/少了谁」（装插件前后用这个）
const against = val('--against');
if (against) {
  if (!existsSync(against)) { console.error('找不到对比文件：' + against); process.exit(3); }
  const oldMap = JSON.parse(readFileSync(against, 'utf8'));
  const changes = diffSlotMaps(oldMap, data);
  if (wantJson) { console.log(JSON.stringify({ before: against, after: file, changed: changes.length, slots: changes }, null, 1)); process.exit(0); }
  console.log('slot 变化 · ' + against + '  →  ' + file);
  if (!changes.length) console.log('  没有任何 slot 的条目变化');
  for (const c of changes) {
    console.log('  ' + c.slot + '  (' + c.before + ' → ' + c.after + ')');
    for (const id of c.added) console.log('    + ' + id);
    for (const id of c.removed) console.log('    - ' + id);
  }
  process.exit(0);
}
const slots = Array.isArray(data.slots) ? data.slots : [];

// 归属规则来自 tools/lib/slot-attr.mjs（与 ui-atlas 共用一份，防漂移）
const byPlugin = groupByPlugin(slots);

const rows = [...byPlugin.entries()].map(([plugin, slotsMap]) => ({
  plugin,
  total: [...slotsMap.values()].reduce((n, v) => n + v.length, 0),
  slots: [...slotsMap.entries()].map(([slot, ids]) => ({ slot, count: ids.length, entries: ids })).sort((a, b) => b.count - a.count),
})).sort((a, b) => b.total - a.total);

const filtered = only ? rows.filter((r) => r.plugin === only || belongsTo(r.plugin, only) || r.plugin.startsWith(only)) : rows;

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
