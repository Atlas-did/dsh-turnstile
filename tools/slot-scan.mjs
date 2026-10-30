#!/usr/bin/env node
// Where does each plugin put its UI, and can that position be changed from config?
// Static: reads dsh.client.inject and the plugin's own bundle patch rows.
// A client plugin whose row declares no slot/anchor/order is flagged: its position is
// hardcoded in code, so two such plugins will fight over the same corner.
// usage: node tools/slot-scan.mjs <profileDir> [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/slot-scan.mjs <profileDir> [--json]'); process.exit(2); }
const pkgPath = join(dir, 'package.json');
if (!existsSync(pkgPath)) { console.error('not a profile: ' + dir); process.exit(2); }
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || Object.keys(pkg.dependencies || {});

const rows = [];
for (const name of bundles) {
  if (name.indexOf('@deepseek-ai/') === 0) continue;
  const base = join(dir, 'node_modules', name);
  const pj = join(base, 'package.json');
  if (!existsSync(pj)) continue;
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const inject = (j.dsh && j.dsh.client && j.dsh.client.inject) || [];
  const surfaces = inject.filter((s) => /ui-/.test(s)).map((s) => String(s).replace('@deepseek-ai/dsh-client-', ''));
  let rowText = '';
  const rel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
  if (rel) {
    const pf = join(base, String(rel).replace(/^\.\//, ''));
    if (existsSync(pf)) rowText = readFileSync(pf, 'utf8');
  }
  if (!inject.length) continue; // node-side only plugin
  const declaresPosition = /\b(slot|anchor|order)\s*:/.test(rowText);
  rows.push({ name, surfaces, declaresPosition, hasClient: true });
}

const hardcoded = rows.filter((r) => r.surfaces.length > 0 && !r.declaresPosition);
const findings = hardcoded.map((r) => ({
  severity: 'warning',
  plugin: r.name,
  resource: r.surfaces.join(', '),
  message: 'renders into ' + r.surfaces.length + ' UI surface(s) but declares no slot/anchor/order',
  evidence: { file: 'node_modules/' + r.name + '/cordis.patch.yml' },
  fix: { kind: 'configurable-position', snippet: 'expose slot/anchor/order in config so two plugins can share a corner' },
}));

if (wantsJson()) { emitJson('slot-scan', findings, 0); process.exit(0); }
console.log('profile: ' + dir + '  client plugins: ' + rows.length);
for (const r of rows) {
  console.log('  ' + (r.declaresPosition ? 'configurable' : 'HARDCODED   ').padEnd(14) + r.name.padEnd(32) + r.surfaces.join(', '));
}
console.log('');
console.log('hardcoded positions: ' + hardcoded.length);
process.exit(0);
