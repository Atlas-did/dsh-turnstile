#!/usr/bin/env node
// UI 面 → 插件 → 注入条目 的矩阵；导出 HTML 与 CSV。
//
// usage: node tools/ui-atlas.mjs <profileDir> [--out state/ui-atlas-<profile>.html] [--csv <file>] [--json]
//
// 数据来源（都可验证）：
//   package.json 的 dsh.client.inject —— 插件声明要往哪些面注入
//   dsh.bundle.patch 里的行 id —— 它往配置里插了哪些行
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { patchFiles } from './lib/patch-files.mjs';

const argv = process.argv.slice(2);
const profileDir = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
if (!profileDir) { console.error('usage: node tools/ui-atlas.mjs <profileDir> [--out x.html] [--csv x.csv] [--json]'); process.exit(2); }
if (!existsSync(join(profileDir, 'package.json'))) { console.error('not a profile: ' + profileDir); process.exit(2); }

const profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const bundles = (profile.dsh && profile.dsh.profile && profile.dsh.profile.bundles) || [];
const patchPath = join(profileDir, 'cordis.patch.yml');
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';

const surfaces = new Map(); // surface -> [{plugin, kind, detail}]
const push = (surface, row) => { if (!surfaces.has(surface)) surfaces.set(surface, []); surfaces.get(surface).push(row); };

for (const name of bundles) {
  const metaPath = join(profileDir, 'node_modules', name, 'package.json');
  if (!existsSync(metaPath)) continue;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const dsh = meta.dsh || {};
  for (const surface of (dsh.client && dsh.client.inject) || []) push(surface, { plugin: name, kind: 'inject', detail: '' });
  for (const f of patchFiles(join(profileDir, 'node_modules', name), dsh.bundle && dsh.bundle.patch)) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) push('patch-row', { plugin: name, kind: 'patch', detail: m[1] });
  }
}

// profile 自己的 patch 行单独列（它不是插件，但会覆盖插件行为）
for (const m of patchText.matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) push('profile-patch', { plugin: '(profile)', kind: 'patch', detail: m[1] });

// 运行时列（可选）：控制台把客户端观测到的 slot 记录 POST 到 /turnstile/slot-map，
// 存在 state/slot-map-<profile>.json。它统计的是「注入条目数」，不是 DOM 节点数——这点要说清。
const slotMapFile = val('--slot-map') || join(process.env.DSH_TURNSTILE_STATE || '.', 'slot-map-' + basename(profileDir) + '.json');
let runtime = null;
if (existsSync(slotMapFile)) {
  try { runtime = JSON.parse(readFileSync(slotMapFile, 'utf8')); } catch { runtime = null; }
}
// 面名与客户端 slot 名不同名（前者是 @deepseek-ai/dsh-client-ui-settings，后者可能是 settings.section），
// 所以把两边都归一化成「最后一段」，再比。
const norm = (s) => String(s || '')
  .replace('@deepseek-ai/dsh-client-ui-', '')
  .replace('@deepseek-ai/dsh-client-', '')
  .replace(/^ui-/, '')
  .split('.').pop()
  .toLowerCase();
// 客户端 slot 名常是「命名空间.路径」（settings.section），面的名字是 settings；
// 所以 slot 侧取第一段，面侧取最后一段。
const slotKey = (s) => String(s || '').split('.')[0].replace(/^ui-/, '').toLowerCase();
const runtimeCount = (surface) => {
  if (!runtime || !Array.isArray(runtime.slots)) return null;
  const want = norm(surface);
  const hits = runtime.slots.filter((s) => slotKey(s.slot) === want);
  if (!hits.length) return null;
  return hits.reduce((n, h) => n + (h.count || 0), 0);
};

const rows = [...surfaces.entries()].map(([surface, list]) => ({ surface, count: new Set(list.map((l) => l.plugin)).size, entries: list, runtime: runtimeCount(surface) }))
  .sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));

if (argv.includes('--json')) { console.log(JSON.stringify({ profile: profileDir, bundles: bundles.length, surfaces: rows }, null, 1)); process.exit(0); }

const csvOut = val('--csv');
if (csvOut) {
  const lines = ['surface,plugin,kind,detail,runtimeCount'];
  for (const r of rows) for (const e of r.entries) lines.push([r.surface, e.plugin, e.kind, e.detail, r.runtime == null ? '' : r.runtime].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(','));
  writeFileSync(csvOut, lines.join('\n') + '\n');
  console.log('CSV 已写 ' + csvOut + '（' + (lines.length - 1) + ' 行）');
}

const out = val('--out') || join('state', 'ui-atlas-' + basename(profileDir) + '.html');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = [
  '<!DOCTYPE html><meta charset="utf-8"><title>UI atlas · ' + esc(basename(profileDir)) + '</title>',
  '<style>body{font:13px/1.6 ui-sans-serif,system-ui,"Microsoft YaHei";background:#0d141c;color:#dce3ea;margin:0;padding:20px}',
  'h1{font-size:17px;margin:0 0 6px}.sub{color:#8fa3b5;margin-bottom:16px}',
  'table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #22303d;padding:6px 8px;text-align:left;vertical-align:top}',
  'th{color:#8fa3b5;font-weight:600;font-size:12px}.n{font-variant-numeric:tabular-nums;color:#69b7ff}',
  '.hot{color:#e3b341;font-weight:600}.pl{color:#b9c7d4}code{color:#7d8fa1;font-size:11px}</style>',
  '<h1>UI 面 → 插件 → 注入条目</h1>',
  '<div class="sub">profile ' + esc(profileDir) + ' · bundles ' + bundles.length + ' · 面 ' + rows.length + '</div>',
  '<table><thead><tr><th>UI 面</th><th>插件数</th><th>运行时条目</th><th>谁在里面（注入 / patch 行）</th></tr></thead><tbody>',
];
for (const r of rows) {
  const plugins = [...new Set(r.entries.map((e) => e.plugin))];
  const cells = plugins.map((p) => {
    const rowIds = r.entries.filter((e) => e.plugin === p && e.kind === 'patch').map((e) => e.detail);
    return '<span class="pl">' + esc(p) + '</span>' + (rowIds.length ? ' <code>' + esc(rowIds.join(',')) + '</code>' : '');
  }).join('<br>');
  html.push('<tr><td>' + esc(r.surface) + '</td><td class="' + (r.count >= 5 ? 'hot' : 'n') + '">' + r.count + '</td><td>' + (r.runtime == null ? '<span class="pl">—</span>' : r.runtime) + '</td><td>' + cells + '</td></tr>');
}
html.push('</tbody></table>');
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, html.join('\n'));
console.log('HTML 已写 ' + out);
for (const r of rows.slice(0, 8)) console.log('  ' + String(r.count).padStart(2) + '  ' + r.surface);
