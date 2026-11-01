#!/usr/bin/env node
// Who occupies which UI surface, and is the position even configurable?
// Joins three sources that already exist: client inject lists, each plugin's own patch row,
// and (when present) the runtime slot snapshot from the probe.
// usage: node tools/occupancy.mjs <profileDir> [--json]
// exit 0 always: this is a map, not a gate. The gate lives in ui-placement/ui-surface.
import { scanUi } from './lib/ui-scan.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/occupancy.mjs <profileDir> [--json]'); process.exit(2); }
const pkgPath = join(dir, 'package.json');
if (!existsSync(pkgPath)) { console.error('not a profile: ' + dir); process.exit(2); }
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || Object.keys(pkg.dependencies || {});

// 扫描口径来自 tools/lib/ui-scan.mjs（唯一实现）；occupancy 只做自己的投影：
// 去掉官方 @deepseek-ai/* 插件、面名缩短、带上可配性。
const scan = scanUi(dir, { onlyUiSurfaces: true });
const configurableOf = new Map(scan.plugins.map((p) => [p.name, Boolean(p.configurable)]));
const surfaces = new Map(); // surface -> [{plugin, configurable}]
for (const [full, plugins] of scan.surfaces) {
  const short = String(full).replace('@deepseek-ai/dsh-client-', '');
  for (const name of plugins) {
    if (name.indexOf('@deepseek-ai/') === 0) continue;
    if (!surfaces.has(short)) surfaces.set(short, []);
    surfaces.get(short).push({ plugin: name, configurable: Boolean(configurableOf.get(name)) });
  }
}

// Current anchors, read from the profile patch (that is where config lives).
const anchors = {};
{
  const patchPath = join(dir, 'cordis.patch.yml');
  if (existsSync(patchPath)) {
    const blocks = readFileSync(patchPath, 'utf8').split(/^\s*-\s*id:/m).slice(1);
    for (const b of blocks) {
      const id = (b.match(/^\s*([\w.@/-]+)/) || [])[1] || '';
      const a = (b.match(/^\s*anchor:\s*([\w-]+)\s*$/m) || [])[1] || null;
      if (id) anchors[id] = a;
    }
  }
}
const rowOf = {};
for (const name of bundles) {
  if (name.indexOf('@deepseek-ai/') === 0) continue;
  const pj = join(dir, 'node_modules', name, 'package.json');
  if (!existsSync(pj)) continue;
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const rel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
  if (!rel) continue;
  const pf = join(dir, 'node_modules', name, String(rel).replace(/^\.\//, ''));
  if (!existsSync(pf)) continue;
  const t = readFileSync(pf, 'utf8');
  const m = t.match(/-\s*id:\s*([\w.@/-]+)/);
  if (m) rowOf[name] = m[1];
}

const rows = [...surfaces.entries()].map(([surface, list]) => {
  const hardcoded = list.filter((l) => !l.configurable).map((l) => l.plugin);
  const contested = list.length > 1 && hardcoded.length > 0;
  return {
    surface, count: list.length, hardcoded, plugins: list.map((l) => l.plugin), contested,
    anchors: Object.fromEntries(list.map((l) => [l.plugin, anchors[rowOf[l.plugin]] || null])),
  };
}).sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));

const findings = rows.filter((r) => r.contested).map((r) => ({
  severity: 'warning',
  plugin: r.hardcoded.join(', '),
  resource: r.surface,
  message: r.count + ' plugins share this surface and ' + r.hardcoded.length + ' cannot be repositioned from config',
  evidence: { file: 'package.json' },
  fix: { kind: 'configurable-position', snippet: 'expose slot/anchor/order, or move one plugin to another surface' },
}));

// --out writes the same payload the panel reads, so the UI needs no subprocess.
const outIdx = argv.indexOf('--out');
if (outIdx >= 0 && argv[outIdx + 1]) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname: dn } = await import('node:path');
  const payload = { checker: 'occupancy', profile: dir, surfaces: rows, findings };
  try { mkdirSync(dn(argv[outIdx + 1]), { recursive: true }); writeFileSync(argv[outIdx + 1], JSON.stringify(payload, null, 2) + '\n'); } catch (e) { console.error('cannot write ' + argv[outIdx + 1]); }
}

if (wantsJson()) { emitJson('occupancy', findings, 0); process.exit(0); }
console.log('profile: ' + dir);
console.log('surface'.padEnd(30) + 'n'.padStart(3) + '  hardcoded' + '   plugins');
for (const r of rows.slice(0, 24)) {
  const mark = r.contested ? '!' : (r.count > 1 ? '~' : ' ');
  console.log(mark + ' ' + r.surface.padEnd(28) + String(r.count).padStart(3) + '  ' +
    String(r.hardcoded.length).padStart(9) + '   ' + r.plugins.join(', ').slice(0, 90));
}
console.log('');
console.log(rows.length + ' surfaces, ' + rows.filter((r) => r.contested).length + ' contested (! = 2+ plugins, at least one hardcoded)');
process.exit(0);
