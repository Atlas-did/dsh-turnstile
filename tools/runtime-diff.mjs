#!/usr/bin/env node
// Compare the STATIC profile with the LIVE loader state written by the probe plugin.
// This is the only check that can see "installed but did not activate" at runtime.
// usage: node tools/runtime-diff.mjs <runtimeSnapshot.json> [--profile <profileDir>] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
const pi = argv.indexOf('--profile');
const profileDir = pi >= 0 ? argv[pi + 1] : '';
let snapPath = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--profile') { i++; continue; }
  if (!argv[i].startsWith('--')) { snapPath = argv[i]; break; }
}
if (!snapPath) { console.error('usage: node tools/runtime-diff.mjs <runtimeSnapshot.json> [--profile <dir>] [--json]'); process.exit(2); }
if (!existsSync(snapPath)) { console.error('no snapshot: ' + snapPath + ' (start DSH with turnstile-probe installed)'); process.exit(2); }

const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const entries = snap.entries || [];
const findings = [];

// 1) What the profile declares vs what the loader actually activated.
let declared = [];
if (profileDir) {
  const pkgPath = join(profileDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    declared = ((pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []).filter((b) => b.indexOf('@deepseek-ai/') !== 0);
  }
}
const activeNames = new Set(entries.filter((e) => e.active).map((e) => String(e.name || e.id)));
const inactiveNames = new Set(entries.filter((e) => !e.active).map((e) => String(e.name || e.id)));
// A package can register several loader rows named "<pkg>/<part>", so match on the prefix too.
const isActive = (b) => activeNames.has(b) || [...activeNames].some((n) => n.indexOf(b + '/') === 0);
// A client-only plugin legitimately has no host fiber, and a disabled row is a deliberate choice:
// neither is a runtime failure. Only a node-side plugin with no entry at all is suspicious.
function clientOnly(name) {
  if (!profileDir) return false;
  const pj = join(profileDir, 'node_modules', name, 'package.json');
  if (!existsSync(pj)) return false;
  try { const j = JSON.parse(readFileSync(pj, 'utf8')); return Boolean(j.dsh && j.dsh.client); } catch { return false; }
}
function disabledRows() {
  const out = new Set();
  if (!profileDir) return out;
  const patch = join(profileDir, 'cordis.patch.yml');
  if (!existsSync(patch)) return out;
  const text = readFileSync(patch, 'utf8');
  for (const block of text.split(/^-\s*id:/m).slice(1)) {
    const id = (block.match(/^\s*([\w.@/-]+)/) || [])[1];
    if (id && /^\s*disabled:\s*true\s*$/m.test(block)) out.add(id);
  }
  return out;
}
const disabled = disabledRows();

for (const b of declared) {
  if (isActive(b)) continue;
  if (disabled.has(b)) continue;
  if (clientOnly(b)) continue;
  const isInactive = [...inactiveNames].some((n) => n === b || n.endsWith('/' + b) || n.indexOf(b + '/') === 0);
  findings.push({
    severity: 'error',
    plugin: b,
    resource: 'runtime',
    message: isInactive
      ? 'declared in the profile but has no running fiber (failed or skipped at boot)'
      : 'declared in the profile but the loader has no entry for it at all',
    evidence: { file: snapPath },
    fix: { kind: 'inspect-boot', snippet: 'run node tools/watch.mjs <host log> to see which service it is waiting for' },
  });
}

if (wantsJson()) { emitJson('runtime-diff', findings, findings.length ? 1 : 0); process.exit(findings.length ? 1 : 0); }
console.log('snapshot: ' + snapPath);
console.log('  pid ' + snap.pid + '  entries ' + (snap.total || entries.length) + '  active ' + (snap.active || activeNames.size));
if (declared.length) {
  console.log('  declared in profile: ' + declared.length + '  active: ' + declared.filter((b) => isActive(b)).length);
}
for (const f of findings) console.log('  MISSING  ' + f.plugin + '  — ' + f.message);
console.log('');
console.log(findings.length ? 'runtime mismatches: ' + findings.length : 'static profile and runtime agree');
process.exit(findings.length ? 1 : 0);
