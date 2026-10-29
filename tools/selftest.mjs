// Self-test for the gate itself: every scanner must still catch its fixture.
// usage: node tools/selftest.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MINI = join(root, 'home/profiles/mini');
const DESK = (process.env.DSH_HOME || '') + '/profiles/desktop';

function run(script, ...args) {
  try {
    const out = execFileSync(process.execPath, [join(root, script), ...args], { encoding: 'utf8', timeout: 480000 });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

const cases = [];
const check = (name, pass, detail) => cases.push({ name, pass, detail });

let r = run('tools/risk.mjs', join(root, 'tests/risk-fixture'));
check('risk catches RED fixture', r.code === 6 && /plug-red\s+1\.0\.0\s+RED/.test(r.out), 'exit=' + r.code);

r = run('tools/conflict.mjs', join(root, 'tests/conflict-fixture'));
check('conflict catches ctx + service', /ctx-assign/.test(r.out) && /service-dup/.test(r.out), 'exit=' + r.code);

r = run('tools/prompt-vars.mjs', join(root, 'tests/gate-fixture'));
check('prompt-vars catches YAML + JS', r.code === 7 && /plug-bad/.test(r.out) && /plug-js/.test(r.out), 'exit=' + r.code);

r = run('tools/preflight.mjs', join(root, 'tests/gate-fixture'), '--no-record');
check('preflight blocks the fixture', r.code === 1, 'exit=' + r.code);

// Environment-specific cases: only meaningful on a machine that actually has these profiles.
// They are skipped (and reported as skipped, not passed) everywhere else.
const hasDesk = existsSync(DESK), hasMini = existsSync(MINI);
if (hasDesk) {
  r = run('tools/preflight.mjs', DESK, '--no-record');
  check('preflight clears desktop', r.code === 0, 'exit=' + r.code);
} else console.log('  SKIP  preflight clears desktop          (no profile at ' + DESK + ')');

if (hasMini) {
  r = run('tools/preflight.mjs', MINI, '--no-record');
  check('preflight clears mini', r.code === 0, 'exit=' + r.code);
  r = run('tools/registry.mjs', MINI);
  check('matrix distinguishes EXEMPTED', /EXEMPTED/.test(r.out), 'exit=' + r.code);
} else {
  console.log('  SKIP  preflight clears mini             (no profile at ' + MINI + ')');
  console.log('  SKIP  matrix distinguishes EXEMPTED     (no mini profile)');
}

// ui-surface: 11 plugins on one UI surface must trip the threshold check (default 10)
r = run('tools/ui-surfaces.mjs', join(root, 'tests/ui-fixture/profiles/ui'));
check('ui-surface blocks crowded fixture', r.code === 11, 'exit=' + r.code);
r = run('tools/preflight.mjs', join(root, 'tests/import-fixture'), '--no-record');
check('preflight blocks unimportable plugin', r.code === 1 && /import-health/.test(r.out), 'exit=' + r.code);

r = run('tools/history.mjs', 'stale', DESK);
check('decisions match installed versions', r.code === 0, 'exit=' + r.code);

r = run('tools/history.mjs', 'new-since', DESK);
check('no unvetted bundle on desktop', r.code === 0, 'exit=' + r.code);

let failed = 0;
for (const c of cases) { if (!c.pass) failed++; console.log((c.pass ? '  PASS  ' : '  FAIL  ') + c.name.padEnd(34) + c.detail); }
console.log('');
console.log(failed ? 'RESULT: ' + failed + ' self-test failure(s)' : 'RESULT: gate is healthy (' + cases.length + ' cases)');
process.exit(failed ? 1 : 0);