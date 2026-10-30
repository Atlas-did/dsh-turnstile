#!/usr/bin/env node
// Fusion mode A: resolve a corner conflict by giving each plugin a different anchor, using
// ONLY values the plugins themselves declare. If a plugin cannot move, we say so and stop.
// usage: node tools/fuse.mjs <profileDir> --surface <ui-surface> [--apply] [--json]
// exit 0 fuse plan ready/applied | 2 usage | 3 cannot fuse by config (see reason) 
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const apply = argv.includes('--apply');
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--surface') { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
const surface = val('--surface');
if (!dir || !surface) { console.error('usage: node tools/fuse.mjs <profileDir> --surface <ui-surface> [--apply] [--json]'); process.exit(2); }

const occ = JSON.parse(execFileSync(process.execPath, [join(root, 'tools/occupancy.mjs'), dir, '--out', join(root, 'state', '.fuse-occ.json')], { encoding: 'utf8' }).length ? readFileSync(join(root, 'state', '.fuse-occ.json'), 'utf8') : '{}');
const row = (occ.surfaces || []).find((s) => s.surface === surface);
if (!row) { console.error('surface not found in this profile: ' + surface); process.exit(2); }

const blockers = [];
const candidates = row.plugins.map((p) => {
  const sug = (() => {
    try { return JSON.parse(execFileSync(process.execPath, [join(root, 'tools/anchor.mjs'), dir, '--package', p, '--suggest'], { encoding: 'utf8' })).suggestions || []; } catch { return []; }
  })();
  const configurable = !(row.hardcoded || []).includes(p);
  if (!configurable) blockers.push(p + ' declares no slot/anchor/order - it cannot move by config');
  else if (!sug.length) blockers.push(p + ' is configurable but documents no anchor values - we will not invent one');
  return { plugin: p, suggestions: sug, configurable, current: (row.anchors || {})[p] || null };
});

if (blockers.length) {
  console.log('cannot fuse ' + surface + ' by configuration:');
  for (const b of blockers) console.log('  - ' + b);
  console.log('');
  console.log('this is the case for source-level merging (mode B), which is not automated here.');
  process.exit(3);
}

// Assign distinct values, preferring ones already in use, then the union of suggestions.
// Each plugin must get a value from ITS OWN documented list, unless two of them pick the same
// one - then the later plugin takes its next documented value. We never move a plugin to a
// position it does not document itself.
const used = new Set();
const plan = [];
for (const c of candidates) {
  const preferred = [c.current].concat(c.suggestions).filter(Boolean);
  const pick = preferred.find((v) => !used.has(v));
  if (!pick) {
    console.log('cannot fuse ' + surface + ' by configuration:');
    console.log('  - ' + c.plugin + ' documents no position that is still free');
    console.log('');
    console.log('this is the case for source-level merging (mode B), which is not automated here.');
    process.exit(3);
  }
  used.add(pick);
  plan.push({ plugin: c.plugin, from: c.current, to: pick });
}

console.log('fusion plan for ' + surface + ':');
for (const p of plan) console.log('  ' + p.plugin.padEnd(34) + (p.from || '(unset)') + '  ->  ' + p.to);

if (!apply) { console.log(''); console.log('DRY RUN - re-run with --apply (each write keeps a .bak).'); process.exit(0); }

let failed = 0;
for (const p of plan) {
  try {
    execFileSync(process.execPath, [join(root, 'tools/anchor.mjs'), dir, '--package', p.plugin, '--anchor', p.to, '--apply'], { stdio: 'inherit' });
  } catch { failed++; }
}
console.log('');
console.log(failed ? failed + ' write(s) failed' : 'fused; restart DSH to take effect');
process.exit(failed ? 1 : 0);
