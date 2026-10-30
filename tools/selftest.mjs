// Self-test for the gate itself: every scanner must still catch its fixture.
// usage: node tools/selftest.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MINI = join(root, 'home/profiles/mini');
const DESK = (process.env.DSH_HOME || '') + '/profiles/desktop';

function runCmd(shellCommand) {
  try {
    const out = execFileSync('bash', ['-lc', shellCommand], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status ?? 1, out: String((e.stdout || '') + (e.stderr || '')) };
  }
}

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

let skipped = 0, envRun = 0;
let r = run('tools/risk.mjs', join(root, 'tests/risk-fixture'));
check('risk catches RED fixture', r.code === 6 && /plug-red\s+1\.0\.0\s+RED/.test(r.out), 'exit=' + r.code);

// AST vs regex: an import that exists only in a comment must not be reported.
r = run('tools/risk.mjs', join(root, 'tests/ast-fixture'));
check('risk ignores commented imports', r.code === 0 && /GREEN/.test(r.out) && /evidence: ast/.test(r.out), 'exit=' + r.code);

// Runtime probe: a service registered under a computed name is invisible to the static
// scan. The probe must see it, and --strict must fail on that gap.
// A known service assigned only in a comment or a string must not be reported.
// menu mode: toggling then quitting must not touch the file.
r = runCmd('printf "t 1\\nq\\n" | node tools/manage.mjs "' + join(root, 'tests/manage-fixture') + '" --menu');
check('manage menu toggles without writing', /\[ \]/.test(r.out) && !/已写入/.test(r.out), 'exit=' + r.code);

r = run('tools/conflict.mjs', join(root, 'tests/conflict-fixture'));
check('conflict ignores commented ctx writes', r.code === 0 && !/ctx\.fs/.test(r.out) && /ctx evidence: ast/.test(r.out), 'exit=' + r.code);

// UI placement: a client plugin with no slot/anchor/order is flagged, one with them is not.
r = run('tools/slot-scan.mjs', join(root, 'tests/slot-fixture'));
check('slot scan flags hardcoded positions', r.code === 0 && /HARDCODED\s+plug-ui\b/.test(r.out) && /configurable\s+plug-ui2/.test(r.out), 'exit=' + r.code);

// Watch: a crash log's service table must be attributed to a named root cause.
r = run('tools/watch.mjs', join(root, 'tests/watch-fixture/crash-host.txt'));
check('watch names the crash root cause', r.code === 1 && /webRuntime/.test(r.out) && /ROOT CAUSE/.test(r.out), 'exit=' + r.code);

// Four conflict surfaces that used to be unchecked: port / file / css / shortcut.
r = run('tools/port-scan.mjs', join(root, 'tests/scan-fixture'));
check('port scan catches duplicate port', r.code === 9 && /34567/.test(r.out), 'exit=' + r.code);

r = run('tools/file-scan.mjs', join(root, 'tests/scan-fixture'));
check('file scan catches shared path', r.code === 9 && /state\.json/.test(r.out), 'exit=' + r.code);

r = run('tools/shortcut-scan.mjs', join(root, 'tests/scan-fixture'));
check('shortcut scan catches duplicate key', r.code === 9 && /ctrl\+k/.test(r.out), 'exit=' + r.code);

r = run('tools/css-scan.mjs', join(root, 'tests/scan-fixture'));
check('css scan catches shared class', /panel/.test(r.out), 'exit=' + r.code);

r = run('tools/probe.mjs', join(root, 'tests/probe-fixture'), '--strict');
check('probe sees computed registration', r.code === 7 && /sharedStore/.test(r.out), 'exit=' + r.code);

// manage: a dry run must describe the change and write nothing.
r = run('tools/manage.mjs', join(root, 'tests/manage-fixture'), '--disable', 'plug-toggle');
check('manage dry-run writes nothing', r.code === 0 && /DRY RUN/.test(r.out), 'exit=' + r.code);

r = run('tools/conflict.mjs', join(root, 'tests/conflict-fixture'));
check('conflict catches ctx + service', /ctx-assign/.test(r.out) && /service-dup/.test(r.out), 'exit=' + r.code);

r = run('tools/prompt-vars.mjs', join(root, 'tests/gate-fixture'));
check('prompt-vars catches YAML + JS', r.code === 7 && /plug-bad/.test(r.out) && /plug-js/.test(r.out), 'exit=' + r.code);

r = run('tools/preflight.mjs', join(root, 'tests/gate-fixture'), '--no-record');
check('preflight blocks the fixture', r.code === 1, 'exit=' + r.code);

// Fix planner: a dry run must name the alias. The alias hint needs a runtime to copy the
// official version from, so without one this counts as an environment case, never a pass.
if (process.env.DSH_RUNTIME_NODE_MODULES || existsSync(join(root, 'node_modules/@deepseek-ai'))) {
  envRun++;
  r = run('tools/fix.mjs', join(root, 'tests/risk-fixture'));
  check('fix plans an npm alias, dry', r.code === 4 && /npm:@deepseek-ai\/schemastery/.test(r.out), 'exit=' + r.code);
} else {
  skipped++;
  console.log('  SKIP  fix plans an npm alias, dry   (no runtime node_modules to resolve the official version)');
}

// Setup wizard: a plan is printed and nothing is written without --yes.
r = run('tools/setup.mjs', '--home', join(root, 'tests/home-fixture/home'), '--json');
check('setup prints a five-step plan', r.code === 0 && /"deps"/.test(r.out) && /"mode"/.test(r.out), 'exit=' + r.code);

// Environment-specific cases: only meaningful on a machine that actually has these profiles.
// They are skipped (and reported as skipped, not passed) everywhere else.

// A case whose fixture is missing must FAIL, not quietly pass because the tool errored out.
const FIXTURES = ['ast-fixture', 'conflict-fixture', 'gate-fixture', 'import-fixture',
  'manage-fixture', 'probe-fixture', 'risk-fixture', 'scan-fixture', 'slot-fixture', 'ui-fixture', 'watch-fixture'];
for (const f of FIXTURES) {
  check('fixture exists: ' + f, existsSync(join(root, 'tests', f)), 'tests/' + f);
}

// Existence is not enough: a fixture that is not tracked by git is invisible to CI
// (this is exactly how tests/watch-fixture/crash-host.log went missing once).
let tracked = null;
try {
  tracked = execFileSync('git', ['ls-files', '--error-unmatch', 'tests'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch { tracked = null; }
if (tracked !== null) {
  const listed = execFileSync('git', ['ls-files', 'tests'], { cwd: root, encoding: 'utf8' });
  for (const f of FIXTURES) {
    check('fixture tracked by git: ' + f, listed.indexOf('tests/' + f + '/') !== -1, 'tests/' + f);
  }
} else {
  skipped += FIXTURES.length;
  console.log('  SKIP  fixtures tracked by git      (not a git checkout)');
}
const hasDesk = existsSync(DESK), hasMini = existsSync(MINI);
if (hasDesk) {
  envRun++;
  r = run('tools/preflight.mjs', DESK, '--no-record');
  check('preflight clears desktop', r.code === 0, 'exit=' + r.code);
} else { skipped++; console.log('  SKIP  preflight clears desktop          (no profile at ' + DESK + ')'); }

if (hasMini) {
  envRun += 2;
  r = run('tools/preflight.mjs', MINI, '--no-record');
  check('preflight clears mini', r.code === 0, 'exit=' + r.code);
  r = run('tools/registry.mjs', MINI);
  check('matrix distinguishes EXEMPTED', /EXEMPTED/.test(r.out), 'exit=' + r.code);
} else {
  skipped += 2;
  console.log('  SKIP  preflight clears mini             (no profile at ' + MINI + ')');
  console.log('  SKIP  matrix distinguishes EXEMPTED     (no mini profile)');
}

// ui-surface: 11 plugins on one UI surface must trip the threshold check (default 10)
r = run('tools/ui-surfaces.mjs', join(root, 'tests/ui-fixture/profiles/ui'));
check('ui-surface blocks crowded fixture', r.code === 11, 'exit=' + r.code);
r = run('tools/preflight.mjs', join(root, 'tests/import-fixture'), '--no-record');
check('preflight blocks unimportable plugin', r.code === 1 && /import-health/.test(r.out), 'exit=' + r.code);

if (hasDesk) {
  envRun += 2;
  r = run('tools/history.mjs', 'stale', DESK);
  check('decisions match installed versions', r.code === 0, 'exit=' + r.code);
  r = run('tools/history.mjs', 'new-since', DESK);
  check('no unvetted bundle on desktop', r.code === 0, 'exit=' + r.code);
} else {
  skipped += 2;
  console.log('  SKIP  gate ledger checks                (no profile at ' + DESK + ')');
}

let failed = 0;
for (const c of cases) { if (!c.pass) failed++; console.log((c.pass ? '  PASS  ' : '  FAIL  ') + c.name.padEnd(34) + c.detail); }
console.log('');
const strict = process.argv.includes('--strict');
if (failed) {
  console.log('RESULT: ' + failed + ' self-test failure(s)');
  process.exit(1);
}
const fix = cases.length - envRun;
console.log('RESULT: ' + fix + ' fixture cases passed, ' + envRun + ' environment case(s) passed, ' + skipped + ' skipped');
if (skipped) {
  console.log('        环境用例未运行 ⇒ 这里的"通过"只描述夹具覆盖，不描述任何真实 profile。');
  console.log('        要把它变成硬性要求：node tools/selftest.mjs --strict');
}
if (strict && skipped) { console.log('STRICT: failing because ' + skipped + ' environment case(s) were skipped'); process.exit(4); }
// Exit-code contract:
//   0  every case ran and passed          (full coverage)
//   1  at least one case failed
//   3  no failures, but coverage was partial (environment cases skipped)
//   4  --strict and coverage was partial
//   0  ... unless --allow-skips, which downgrades 3 back to 0 on purpose
if (skipped && !process.argv.includes('--allow-skips')) {
  console.log('EXIT 3: 覆盖不完整（' + skipped + ' 个环境用例未运行）。要接受这一点请加 --allow-skips。');
  process.exit(3);
}
process.exit(0);
process.exit(failed ? 1 : 0);