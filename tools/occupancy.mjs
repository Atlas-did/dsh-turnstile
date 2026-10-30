#!/usr/bin/env node
// Who occupies which UI surface, and is the position even configurable?
// Joins three sources that already exist: client inject lists, each plugin's own patch row,
// and (when present) the runtime slot snapshot from the probe.
// usage: node tools/occupancy.mjs <profileDir> [--json]
// exit 0 always: this is a map, not a gate. The gate lives in ui-placement/ui-surface.
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

const surfaces = new Map(); // surface -> [{plugin, configurable}]
for (const name of bundles) {
  if (name.indexOf('@deepseek-ai/') === 0) continue;
  const base = join(dir, 'node_modules', name);
  const pj = join(base, 'package.json');
  if (!existsSync(pj)) continue;
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const inject = (j.dsh && j.dsh.client && j.dsh.client.inject) || [];
  const ui = inject.filter((s) => s.indexOf('ui-') !== -1).map((s) => String(s).replace('@deepseek-ai/dsh-client-', ''));
  if (!ui.length) continue;
  let rowText = '';
  const rel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
  if (rel) {
    const pf = join(base, String(rel).replace(/^\.\//, ''));
    if (existsSync(pf)) rowText = readFileSync(pf, 'utf8');
  }
  const configurable = /\b(slot|anchor|order)\s*:/.test(rowText);
  for (const s of ui) {
    if (!surfaces.has(s)) surfaces.set(s, []);
    surfaces.get(s).push({ plugin: name, configurable });
  }
}

const rows = [...surfaces.entries()].map(([surface, list]) => {
  const hardcoded = list.filter((l) => !l.configurable).map((l) => l.plugin);
  const contested = list.length > 1 && hardcoded.length > 0;
  return { surface, count: list.length, hardcoded, plugins: list.map((l) => l.plugin), contested };
}).sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));

const findings = rows.filter((r) => r.contested).map((r) => ({
  severity: 'warning',
  plugin: r.hardcoded.join(', '),
  resource: r.surface,
  message: r.count + ' plugins share this surface and ' + r.hardcoded.length + ' cannot be repositioned from config',
  evidence: { file: 'package.json' },
  fix: { kind: 'configurable-position', snippet: 'expose slot/anchor/order, or move one plugin to another surface' },
}));

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
