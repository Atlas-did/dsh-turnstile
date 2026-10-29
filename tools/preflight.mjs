// Preflight gate for a DSH profile: run every known failure-surface check
// before a plugin is allowed near the main environment.
// usage: node tools/preflight.mjs <profileDir>
//   exit 0 = all clear, 1 = at least one blocking finding
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';

const checks = [
  { name: 'dependency-risk', script: 'tools/risk.mjs', okExit: 0, hint: 'RED = imports a peer-only non-official package' },
  { name: 'conflict-surface', script: 'tools/conflict.mjs', okExit: 0, hint: 'ctx overwrite / duplicate service / port / version split' },
  { name: 'engine-gate', script: 'tools/engines.mjs', okExit: 0, hint: 'plugins the loader will skip' },
  { name: 'prompt-vars', script: 'tools/prompt-vars.mjs', okExit: 0, hint: 'persona text using unregistered variables' },
  { name: 'import-health', script: 'tools/import-health.mjs', okExit: 0, hint: 'a module cannot be resolved even before restart' },
  { name: 'ui-surface', script: 'tools/ui-surfaces.mjs', okExit: 0, hint: 'too many plugins injecting one UI surface (DSH_UI_THRESHOLD, default 10)' }
];

// optional: prove the scanners still work before trusting their verdict
if (process.argv.includes('--self-check')) {
  let ok = true;
  try { execFileSync(process.execPath, [join(root, 'tools/selftest.mjs')], { stdio: 'inherit', timeout: 600000 }); }
  catch { ok = false; }
  if (!ok) { console.log(''); console.log('ABORT: gate self-test failed, refusing to report a verdict'); process.exit(2); }
  console.log('');
}

const rows = [];
for (const c of checks) {
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [join(root, c.script), dir], { encoding: 'utf8', timeout: 240000 });
  } catch (e) {
    code = e.status ?? 1;
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  const ok = code === c.okExit;
  const hardLine = out.split('\n').find(l => l.includes('HARD ('));
  const tail = (hardLine && c.name === 'import-health') ? hardLine.trim() : (out.trim().split('\n').filter(Boolean).slice(-1)[0] || '');
  rows.push({ name: c.name, ok, tail: tail.slice(0, 110), hint: c.hint });
}

console.log('preflight: ' + dir);
for (const r of rows) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name.padEnd(20) + r.tail);
  if (!r.ok) console.log('        \u2192 ' + r.hint);
}
const failed = rows.filter(r => !r.ok);
// advisory: version matrix (UNCERTIFIED runs anyway; not blocking, but worth seeing)
let matrix = '';
try {
  matrix = execFileSync(process.execPath, [join(root, 'tools/registry.mjs'), dir], { encoding: 'utf8', timeout: 240000 });
} catch (e) { matrix = String(e.stdout || ''); }
// an ALLOW decision for <pkg>@<ver>|version-matrix|... silences that row
let allowKeys = [];
try {
  const db = JSON.parse(readFileSync(join(root, 'state/gate-history.json'), 'utf8'));
  allowKeys = db.decisions.filter(d => d.decision === 'allow' && d.key.includes('|version-matrix|')).map(d => d.key.split('|')[0]);
} catch {}
const risky = matrix.split('\n')
  .filter(l => /^(UNCERTIFIED|SKIPPED|MISSING)/.test(l))
  .filter(l => {
    const parts = l.trim().split(/\s+/);
    const key = parts[1] + '@' + parts[2];
    return !allowKeys.includes(key);
  });
console.log('');
console.log('advisory: version matrix');
console.log(risky.length ? risky.map(l => '  !  ' + l.trim()).join('\n') : '  (all plugins declare this runtime)');
// advisory: decisions recorded for an older version of the same plugin
let staleOut = '';
try { staleOut = execFileSync(process.execPath, [join(root, 'tools/history.mjs'), 'stale', dir], { encoding: 'utf8', timeout: 60000 }); }
catch (e) { staleOut = String(e.stdout || ''); }
const staleLines = staleOut.split('\n').filter(l => l.startsWith('STALE'));
if (staleLines.length) {
  console.log('');
  console.log('advisory: decisions needing review');
  for (const l of staleLines) console.log('  !  ' + l.trim());
}

console.log('');
console.log(failed.length ? 'RESULT: ' + failed.length + ' blocking check(s)' : 'RESULT: clear to install');

// append to the machine-readable history so a decision carries its versions
if (!process.argv.includes('--no-record')) {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const tmp = join(mkdtempSync(join(tmpdir(), 'pf-')), 'checks.json');
  let bundlesNow = [];
  try { bundlesNow = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh?.profile?.bundles || []; } catch {}
  writeFileSync(tmp, JSON.stringify({ checks: rows.map(r => ({ name: r.name, ok: r.ok, detail: r.tail })), bundles: bundlesNow }), 'utf8');
  try {
    execFileSync(process.execPath, [join(root, 'tools/history.mjs'), 'record', dir, failed.length ? 'blocked' : 'clear', tmp], { encoding: 'utf8', timeout: 30000 });
  } catch {}
}
process.exit(failed.length ? 1 : 0);