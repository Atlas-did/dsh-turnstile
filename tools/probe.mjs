#!/usr/bin/env node
// Runtime probe: actually apply each plugin against a stub ctx, then compare what it did
// against what the static scanners claimed. This is the only check that can see
// dynamic registration and Service-subclass provisioning.
// usage: node tools/probe.mjs <profileDir> [--strict] [--only <name>]
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && !a.startsWith('C:') && !a.startsWith('/')) || args[0];
const onlyIdx = args.indexOf('--only');
const only = onlyIdx > 0 ? args[onlyIdx + 1] : '';
const strict = args.includes('--strict');
const profile = dir || ((process.env.DSH_HOME || '') + '/profiles/desktop');

if (!existsSync(join(profile, 'package.json'))) {
  console.error('profile not found: ' + profile);
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
const declared = pkg.dsh?.profile?.bundles || [];
// fixtures often declare only dependencies; fall back so the probe works on both shapes
const bundles = (declared.length ? declared : Object.keys(pkg.dependencies || {})).filter((b) => !b.startsWith('@deepseek-ai/'));

function entryOf(name) {
  const d = join(profile, 'node_modules', name);
  const pj = join(d, 'package.json');
  if (!existsSync(pj)) return null;
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const cands = [];
  const ex = j.exports && (j.exports['.'] || j.exports);
  if (typeof ex === 'string') cands.push(ex);
  else if (ex && typeof ex === 'object') {
    if (typeof ex.default === 'string') cands.push(ex.default);
    if (typeof ex.import === 'string') cands.push(ex.import);
  }
  if (j.main) cands.push(j.main);
  cands.push('lib/index.js', 'index.js');
  for (const c of cands) {
    if (!c) continue;
    const p = join(d, c.replace(/^\.\//, ''));
    if (existsSync(p)) return p;
  }
  return null;
}

const worker = join(ROOT, 'tools', 'probe-worker.mjs');
const rows = [];
const targets = bundles.filter((b) => !only || b === only);

for (const name of targets) {
  const entry = entryOf(name);
  if (!entry) { rows.push({ name, status: 'no-entry' }); continue; }
  let out = '';
  try {
    out = execFileSync(process.execPath, [worker, resolve(entry)], {
      timeout: Number(process.env.PROBE_TIMEOUT_MS || 9000),
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, PROBE_DEADLINE_MS: String(Number(process.env.PROBE_TIMEOUT_MS || 9000) - 500) },
    }).toString();
  } catch { rows.push({ name, status: 'killed-or-crashed' }); continue; }
  let data = null;
  try { data = JSON.parse(out.trim().split('\n').pop()); } catch { rows.push({ name, status: 'bad-output' }); continue; }
  // static side: literal ctx.provide() only (the weaker evidence we are testing)
  const dirD = join(profile, 'node_modules', name);
  let staticText = '';
  for (const rel of ['lib/index.js', 'index.js']) {
    const p = join(dirD, rel);
    if (existsSync(p)) { staticText += readFileSync(p, 'utf8'); break; }
  }
  const staticProvided = new Set([...staticText.matchAll(/ctx\.provide\(\s*['"]([\w.-]+)['"]/g)].map((m) => m[1]));
  const probeProvided = new Set(data.provided || []);
  const missed = [...probeProvided].filter((s) => !staticProvided.has(s));
  rows.push({
    name,
    status: data.timeout ? 'timeout' : (data.applyError ? 'apply-error' : (data.importError ? 'import-error' : (data.noApply ? 'no-apply' : 'ran'))),
    provided: [...probeProvided],
    assigned: data.assigned || [],
    injectedCount: (data.injected || []).length,
    missed,
    note: data.applyError || data.importError || '',
  });
}

console.log('profile: ' + profile + '  probed: ' + rows.length);
console.log('PLUGIN'.padEnd(30) + 'STATUS'.padEnd(16) + 'PROVIDED'.padEnd(22) + 'MISSED-BY-STATIC');
let gaps = 0;
for (const r of rows) {
  const missed = (r.missed || []).join(',') || '-';
  if ((r.missed || []).length) gaps++;
  console.log(String(r.name).padEnd(30) + String(r.status).padEnd(16) + (r.provided || []).join(',') .slice(0, 20).padEnd(22) + missed);
}
const ran = rows.filter((r) => r.status === 'ran').length;
console.log('\nran ' + ran + '/' + rows.length + '   static blind spots: ' + gaps);
if (ran < rows.length) console.log('未跑起来的多数是需要真实宿主服务（ctx.*），这本身就是证据：静态扫描看不出它要什么。');
if (strict && gaps) { console.log('STRICT: ' + gaps + ' plugin(s) registered something the static scan missed'); process.exit(7); }
process.exit(0);