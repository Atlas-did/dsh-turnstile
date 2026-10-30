#!/usr/bin/env node
// Preflight gate for a DSH profile: run every known failure-surface check before a plugin
// is allowed near the main environment.
//
// usage: node tools/preflight.mjs <profileDir> [--only a,b] [--skip c] [--json] [--no-record] [--self-check]
// exit:  0 all clear | 1 at least one blocking finding
// env:   DSH_CHECK_TIMEOUT=30000   per-check budget in ms (was 240s serial before)
//
// Checks run in PARALLEL with an individual timeout: one slow or hung checker can no longer
// stall the whole gate (a phone/proot run used to hit a 180s wall and time out).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flagValue = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const isFlag = (name) => argv.includes(name);

const CHECKS = [
  { name: 'dependency-risk', script: 'tools/risk.mjs', hint: 'RED = imports a peer-only non-official package' },
  { name: 'conflict-surface', script: 'tools/conflict.mjs', hint: 'ctx overwrite / duplicate service / port / version split' },
  { name: 'engine-gate', script: 'tools/engines.mjs', hint: 'plugins the loader will skip' },
  { name: 'prompt-vars', script: 'tools/prompt-vars.mjs', hint: 'persona text using unregistered variables' },
  { name: 'import-health', script: 'tools/import-health.mjs', hint: 'a module cannot be resolved even before restart' },
  { name: 'ui-surface', script: 'tools/ui-surfaces.mjs', hint: 'too many plugins injecting one UI surface (DSH_UI_THRESHOLD, default 10)' },
];

const only = (flagValue('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const skip = (flagValue('--skip') || '').split(',').map((s) => s.trim()).filter(Boolean);
const aliasOf = (c) => [c.name, c.name.split('-')[0], c.script.split('/').pop().replace(/\.mjs$/, '')];
const matches = (list, c) => list.some((x) => aliasOf(c).includes(x));
const selected = CHECKS.filter((c) => {
  if (only.length && !matches(only, c)) return false;
  if (matches(skip, c)) return false;
  return true;
});

const VALUE_FLAGS = new Set(['--only', '--skip']);
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (VALUE_FLAGS.has(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
if (!dir) { console.error('usage: node tools/preflight.mjs <profileDir> [--only a,b] [--skip c] [--json]'); process.exit(2); }
if (!existsSync(join(dir, 'package.json'))) { console.error('not a profile (no package.json): ' + dir); process.exit(2); }

const timeout = Number(process.env.DSH_CHECK_TIMEOUT || 30000);

if (isFlag('--self-check')) {
  try { await run(process.execPath, [join(root, 'tools/selftest.mjs')], { timeout: 600000 }); }
  catch {
    console.log('');
    console.log('ABORT: gate self-test failed, refusing to judge a profile with untrusted scanners');
    process.exit(2);
  }
}

async function one(c) {
  const started = Date.now();
  try {
    const { stdout, stderr } = await run(process.execPath, [join(root, c.script), dir], { timeout, maxBuffer: 32 * 1024 * 1024 });
    return { name: c.name, hint: c.hint, exit: 0, ok: true, out: String(stdout), ms: Date.now() - started };
  } catch (e) {
    const code = typeof e.code === 'number' ? e.code : (e.killed ? 'timeout' : 'error');
    const out = String((e.stdout || '') + (e.stderr || ''));
    return { name: c.name, hint: c.hint, exit: code, ok: false, out, ms: Date.now() - started, timedOut: e.killed === true };
  }
}

const results = await Promise.all(selected.map(one));
const failed = results.filter((r) => !r.ok);

if (isFlag('--json')) {
  console.log(JSON.stringify({
    profile: dir,
    timeoutMs: timeout,
    checks: results.map((r) => ({
      name: r.name, ok: r.ok, exit: r.exit, ms: r.ms, timedOut: Boolean(r.timedOut),
      summary: (r.out.trim().split('\n').pop() || '').slice(0, 200),
    })),
    result: failed.length ? 'blocked' : 'clear',
    exit: failed.length ? 1 : 0,
  }, null, 2));
} else {
  for (const r of results) {
    const tag = r.ok ? 'PASS' : (r.timedOut ? 'TIMEOUT' : 'FAIL');
    const last = (r.out.trim().split('\n').pop() || '').slice(0, 90);
    console.log('  ' + tag.padEnd(8) + r.name.padEnd(18) + String(r.ms).padStart(6) + 'ms  ' + last);
    if (!r.ok) console.log('           hint: ' + r.hint);
  }
  console.log('');
  console.log(failed.length ? 'RESULT: ' + failed.length + ' blocking check(s)' : 'RESULT: clear to install');
}

if (!failed.length && !isFlag('--no-record')) {
  const tmp = join(root, 'state', '.preflight-' + process.pid + '.txt');
  try {
    writeFileSync(tmp, results.map((r) => r.name + ': ' + (r.ok ? 'ok' : 'fail')).join('\n'));
    const h = await run(process.execPath, [join(root, 'tools/history.mjs'), 'record', dir, 'clear', tmp], { timeout: 30000 });
    void h;
  } catch { /* recording is best-effort */ }
  try { unlinkSync(tmp); } catch { /* ignore */ }
}

process.exit(failed.length ? 1 : 0);
