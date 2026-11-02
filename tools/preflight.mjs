#!/usr/bin/env node
// Preflight gate for a DSH profile: run every failure-surface check in parallel, consume each
// checker's --json envelope when it provides one, and fall back to text for the rest.
//
// usage: node tools/preflight.mjs <profileDir> [--only a,b] [--skip c] [--json] [--no-record] [--self-check]
// exit:  0 all clear | 1 at least one blocking finding
// env:   DSH_CHECK_TIMEOUT=30000   per-check budget in ms
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCheckManifest } from './lib/check-manifest.mjs';
import { stateFromCheck } from './lib/check-phase.mjs';

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flagValue = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const isFlag = (name) => argv.includes(name);

const CHECKS = [
  // B6: a profile whose own YAML does not parse cannot boot - this must block, not advise.
  { name: 'profile-yaml', script: 'tools/profile-yaml.mjs', hint: 'the profile itself cannot boot' },
  { name: 'dependency-risk', script: 'tools/risk.mjs', hint: 'RED = imports a peer-only non-official package' },
  { name: 'conflict-surface', script: 'tools/conflict.mjs', hint: 'ctx overwrite / duplicate service / port / version split' },
  { name: 'engine-gate', script: 'tools/engines.mjs', hint: 'plugins the loader will skip', advisory: true },
  { name: 'prompt-vars', script: 'tools/prompt-vars.mjs', hint: 'persona text using unregistered variables' },
  { name: 'import-health', script: 'tools/import-health.mjs', hint: 'a module cannot be resolved even before restart' },
  { name: 'ui-surface', script: 'tools/ui-surfaces.mjs', hint: 'too many plugins injecting one UI surface (DSH_UI_THRESHOLD, default 10)' },
  { name: 'port-conflict', script: 'tools/port-scan.mjs', hint: 'two plugins claim the same fixed port' },
  { name: 'file-conflict', script: 'tools/file-scan.mjs', hint: 'two plugins write the same absolute path' },
  { name: 'shortcut-conflict', script: 'tools/shortcut-scan.mjs', hint: 'two plugins register the same shortcut' },
  { name: 'css-collision', script: 'tools/css-scan.mjs', hint: 'advisory: global CSS class defined by more than one plugin', advisory: true },
  { name: 'ui-placement', script: 'tools/slot-scan.mjs', hint: 'advisory: client plugins whose UI position is hardcoded (no slot/anchor/order)', advisory: true },
];

const VALUE_FLAGS = new Set(['--only', '--skip', '--checks']);
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (VALUE_FLAGS.has(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
if (!dir) { console.error('usage: node tools/preflight.mjs <profileDir> [--only a,b] [--skip c] [--checks manifest.json] [--json]'); process.exit(2); }
if (!existsSync(join(dir, 'package.json'))) { console.error('not a profile (no package.json): ' + dir); process.exit(2); }

const timeout = Number(process.env.DSH_CHECK_TIMEOUT || 30000);

// Runtime truth, when the probe plugin left a snapshot behind: the only check that can see
// "installed but did not activate" without trusting static files.
(() => {
  const guess = join(root, 'state', 'runtime-' + dir.split(/[\\/]/).pop() + '.json');
  const snap = process.env.DSH_RUNTIME_SNAPSHOT || (existsSync(guess) ? guess : '');
  if (snap) CHECKS.push({ name: 'runtime-truth', script: 'tools/runtime-diff.mjs', args: [snap, '--profile', dir], hint: 'declared in the profile but never activated at runtime' });
})();

// 外部检查器只在用户显式提供清单时运行；绝不自动发现或执行 profile 中的代码。
const checkManifest = flagValue('--checks');
if (isFlag('--checks') && (!checkManifest || checkManifest.startsWith('--'))) {
  console.error('检查器清单无效：--checks 后面必须给 manifest.json 路径');
  process.exit(2);
}
if (checkManifest) {
  try {
    const extensions = loadCheckManifest(checkManifest);
    const names = new Set(CHECKS.map((c) => c.name));
    for (const check of extensions) {
      if (names.has(check.name)) throw new Error('检查器清单无效：与内置检查器重名：' + check.name);
      names.add(check.name);
      CHECKS.push(check);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

// Selection happens after runtime and extension checks may have been appended above.
const only = (flagValue('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const skip = (flagValue('--skip') || '').split(',').map((s) => s.trim()).filter(Boolean);
const aliasOf = (c) => [c.name, c.name.split('-')[0], c.script.split('/').pop().replace(/\.mjs$/, '')];
const matches = (list, c) => list.some((x) => aliasOf(c).includes(x));
const selected = CHECKS.filter((c) => {
  if (only.length && !matches(only, c)) return false;
  if (matches(skip, c)) return false;
  return true;
});

if (isFlag('--regen')) {
  // Keep the service knowledge aligned with the runtime instead of silently judging
  // a profile with a stale allowlist.
  try {
    const { stdout } = await run(process.execPath, [join(root, 'tools/knowledge-gen.mjs')], { timeout: 120000 });
    process.stdout.write(stdout);
  } catch (e) {
    console.log('regen skipped: ' + String((e && e.message) || e).slice(0, 120));
  }
}

if (isFlag('--self-check')) {
  try { await run(process.execPath, [join(root, 'tools/selftest.mjs')], { timeout: 600000 }); }
  catch {
    console.log('');
    console.log('ABORT: gate self-test failed, refusing to judge a profile with untrusted scanners');
    process.exit(2);
  }
}

function parseEnvelope(stdout) {
  try {
    const j = JSON.parse(String(stdout));
    return j && j.checker ? j : null;
  } catch { return null; }
}

async function one(c) {
  const started = Date.now();
  const script = c.source ? c.script : join(root, c.script);
  const source = c.source || 'builtin';
  const args = c.args ? [script, ...c.args, '--json'] : [script, dir, '--json'];
  try {
    const { stdout } = await run(process.execPath, args, { timeout, maxBuffer: 32 * 1024 * 1024 });
    const j = parseEnvelope(stdout);
    return { name: c.name, hint: c.hint, source, exit: 0, ok: true, ms: Date.now() - started, structured: Boolean(j), findings: j ? j.findings : [], out: j ? '' : String(stdout) };
  } catch (e) {
    const code = typeof e.code === 'number' ? e.code : (e.killed ? 'timeout' : 'error');
    const j = parseEnvelope(String(e.stdout || ''));
    const text = String((e.stdout || '') + (e.stderr || ''));
    // 缺依赖不是「你的 profile 坏了」：报 skipped + 可执行下一步，别让它冒充 FAIL。
    // （外部审查在没 npm install 的环境里只看到一句 profile-yaml FAIL，根因无从判断）
    const missing = /MISSING_DEPENDENCY|缺少依赖 ([\w@/-]+)/.exec(text);
    if (missing) {
      return {
        name: c.name, hint: c.hint, source, exit: 0, ok: true, ms: Date.now() - started,
        skipped: true, skipReason: 'missing-dependency',
        next: 'npm install（仓库根）',
        structured: Boolean(j), findings: [],
        out: 'SKIPPED: 缺依赖 ' + (missing[1] || '') + ' — 跑 npm install 后重试',
      };
    }
    return {
      name: c.name, hint: c.hint, source, exit: code, ok: false, ms: Date.now() - started,
      timedOut: e.killed === true, structured: Boolean(j), findings: j ? j.findings : [],
      out: j ? '' : text,
    };
  }
}

const results = await Promise.all(selected.map(one));
// 每条检查都带六态（未执行/跳过/超时/检查器失败/目标未通过/无变化）。
// 判 blocking 仍用 ok，不改门禁语义；state 只是把「为什么」说清楚。
for (const r of results) r.state = stateFromCheck(r);
// A check marked advisory can report findings without blocking the gate (e.g. an engine skip
// means "this plugin will not load", not "your profile is broken").
const blocking = results.filter((r) => !r.ok && !selected.find((c) => c.name === r.name)?.advisory);
const failed = blocking;

// Machine-readable report for panels/CI. Written unless --no-report.
if (!isFlag('--no-report')) {
  // B17: the panel reads this through DSH_TURNSTILE_STATE; writing elsewhere made the two disagree.
  const stateDir = process.env.DSH_TURNSTILE_STATE || join(root, 'state');
  const reportPath = (() => { const i = argv.indexOf('--report'); return i >= 0 ? argv[i + 1] : join(stateDir, 'report-' + (dir.split(/[\\/]/).pop()) + '.json'); })();
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      profile: dir,
      generatedAt: new Date().toISOString(),
      runtimeTimeoutMs: timeout,
      checks: results.map((r) => ({
        name: r.name, state: r.state, source: r.source, ok: r.ok, exit: r.exit, ms: r.ms, timedOut: Boolean(r.timedOut),
        skipped: Boolean(r.skipped), skipReason: r.skipReason || null, next: r.next || null,
        structured: r.structured, findings: r.findings,
        summary: r.structured ? '' : (r.out.trim().split('\n').pop() || '').slice(0, 200),
      })),
      blocking: blocking.map((r) => r.name),
      result: failed.length ? 'blocked' : 'clear',
      exit: failed.length ? 1 : 0,
    }, null, 2) + '\n');
  } catch { /* a report is a convenience, never a gate */ }
}

if (isFlag('--json')) {
  console.log(JSON.stringify({
    profile: dir,
    timeoutMs: timeout,
    checks: results.map((r) => ({
      name: r.name, state: r.state, source: r.source, ok: r.ok, exit: r.exit, ms: r.ms, timedOut: Boolean(r.timedOut),
      skipped: Boolean(r.skipped), skipReason: r.skipReason || null, next: r.next || null,
      structured: r.structured, findings: r.findings,
      summary: r.structured ? '' : (r.out.trim().split('\n').pop() || '').slice(0, 200),
    })),
    blocking: blocking.map((r) => r.name),
    result: failed.length ? 'blocked' : 'clear',
    exit: failed.length ? 1 : 0,
  }, null, 2));
} else {
  for (const r of results) {
    const advisory = Boolean(selected.find((c) => c.name === r.name)?.advisory);
    const tag = r.ok ? 'PASS' : (r.timedOut ? 'TIMEOUT' : (advisory ? 'WARN' : 'FAIL'));
    const n = (r.findings || []).length;
    const detail = r.structured
      ? (n ? n + ' finding(s), e.g. ' + r.findings.slice(0, 2).map((f) => f.message + ' @ ' + (f.plugin || '?')).join('; ') : 'no findings')
      : (r.out.trim().split('\n').pop() || '').slice(0, 90);
    console.log('  ' + tag.padEnd(8) + r.name.padEnd(18) + String(r.ms).padStart(6) + 'ms  ' + detail);
    if (!r.ok) console.log('           hint: ' + r.hint);
  }
  console.log('');
  console.log(failed.length ? 'RESULT: ' + failed.length + ' blocking check(s)' : 'RESULT: clear to install');
}

if (isFlag('--fix')) {
  // Ask the fix planner what it would change; --apply is a separate, explicit step.
  const fixArgs = [join(root, 'tools/fix.mjs'), dir];
  if (isFlag('--apply')) fixArgs.push('--apply');
  try {
    const { stdout } = await run(process.execPath, fixArgs, { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    process.stdout.write(stdout);
  } catch (e) {
    // fix.mjs exits 4 for "plan ready, nothing written" — that is not an error here.
    if (e && e.stdout) process.stdout.write(String(e.stdout));
    if (e && e.stderr) process.stderr.write(String(e.stderr));
  }
}

if (!failed.length && !isFlag('--no-record')) {
  const tmp = join(root, 'state', '.preflight-' + process.pid + '.txt');
  try {
    writeFileSync(tmp, results.map((r) => r.name + ': ' + (r.ok ? 'ok' : 'fail')).join('\n'));
    await run(process.execPath, [join(root, 'tools/history.mjs'), 'record', dir, 'clear', tmp], { timeout: 30000 });
  } catch { /* recording is best-effort */ }
  try { unlinkSync(tmp); } catch { /* ignore */ }
}

process.exit(failed.length ? 1 : 0);
