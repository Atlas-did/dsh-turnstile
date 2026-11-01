#!/usr/bin/env node
// 真实 mini 端到端验收（handoff P0-1）：安装 → 六级 → 卸载 → 回滚证据，全部落成机器可读 JSON。
// usage:
//   node tools/acceptance-mini.mjs <name> [--dir <parent>] [--mini <root>] [--out <file>] [--json]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const name = argv.find((a) => !a.startsWith('--') && a !== val('--dir') && a !== val('--mini') && a !== val('--out'));
if (!name) { console.error('usage: node tools/acceptance-mini.mjs <name> [--dir <parent>] [--mini <root>] [--out <file>] [--json]'); process.exit(2); }
const mini = val('--mini') || process.env.MINI_HOME || '';
if (!mini || !existsSync(join(mini, 'home', 'profiles', 'mini'))) { console.error('需要 --mini <mini-root>（含 home/profiles/mini）'); process.exit(2); }
const parent = val('--dir') || process.env.TEMP || '.';
const outDir = join(parent, name);
const profileDir = join(mini, 'home', 'profiles', 'mini');
const dshBin = join(mini, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

import { judgeVerify, judgeAcceptance, hasTrialChanges } from './lib/acceptance.mjs';

const state = { claim: "unknown", levels: null, after: null, ok: false, installedByUs: false, phase: "init", rollback: null };
const steps = [];
const step = (id, ok, detail, extra) => { steps.push(Object.assign({ id, ok, detail: detail || '' }, extra || {})); return ok; };

function runNode(script, args, timeout = 900000) {
  try { return { code: 0, out: execFileSync(process.execPath, [join(here, script), ...args], { encoding: 'utf8', timeout }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
}
function jsonOf(out) { try { return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { return null; } }
// 任何未捕获异常都要：回滚本次改动 → 落证据 → 退出码 1（复审 P1-3）
process.on('uncaughtException', (e) => {
  step('unexpected-error', false, String(e && e.message || e).slice(0, 120));
  if (state.installedByUs) { const rb = rollbackOwnChanges(); state.rollback = rb; step('rollback-on-failure', rb.ok, rb.ok ? '已恢复 package.json 并删除本次安装' : '回滚未完全成功：' + rb.error); }
  try { const r = flushEvidence({ failedEarly: true }); console.error('验收中断（' + state.phase + '），证据：' + r.outFile); } catch (e2) { console.error('证据也写不出来：' + String(e2 && e2.message)); }
  process.exit(1);
});
process.on('unhandledRejection', (e) => { throw e; });


// 0) 预检与事务边界（复审 P1-3）：记录原始状态，只回滚本次创建的东西
const pkgPath0 = join(profileDir, 'package.json');
const originalPkg = readFileSync(pkgPath0, 'utf8');
const nm0 = join(profileDir, 'node_modules', name);
const preexisting = {
  bundle: (JSON.parse(originalPkg).dsh?.profile?.bundles || []).includes(name),
  dep: Boolean(JSON.parse(originalPkg).dependencies?.[name]),
  dir: existsSync(nm0),
};
const alreadyThere = preexisting.bundle || preexisting.dep || preexisting.dir;
if (alreadyThere && !has('--overwrite')) {
  console.error('目标已存在（bundle=' + preexisting.bundle + ' dep=' + preexisting.dep + ' dir=' + preexisting.dir + '）。');
  console.error('为避免把已有安装当成「本次试装」删掉，默认拒绝；确需覆盖请加 --overwrite。');
  process.exit(3);
}

function rollbackOwnChanges() {
  const problems = [];
  // 只恢复我们造成的改变：package.json 复原 + 删掉我们装的目录
  try { writeFileSync(pkgPath0, originalPkg); } catch (e) { problems.push(String(e.message)); }
  try { if (!preexisting.dir && existsSync(nm0)) rmSync(nm0, { recursive: true, force: true }); } catch (e) { problems.push(String(e.message)); }
  return problems.length ? { ok: false, error: problems.join('；') } : { ok: true, error: '' };
}

// 1) 生成插件（可重复：已存在就复用）
if (!existsSync(outDir)) {
  const made = runNode('new-plugin.mjs', [name, '--dir', parent], 120000);
  step('create', made.code === 0, made.code === 0 ? outDir : (made.out.trim().split('\n').pop() || ''));
} else step('create', true, '复用已有目录 ' + outDir);

// 1.4) L5 基线：装前 UI 面 + health（回归对比用）
const surfBefore = join(parent, '.' + name + '-surfaces-before.json');
let l5Ready = false;
try {
  const { scanUi, surfaceCounts } = await import('./lib/ui-scan.mjs');
  writeFileSync(surfBefore, JSON.stringify(surfaceCounts(scanUi(profileDir))));
  l5Ready = true;
} catch (e) { l5Ready = false; }
step('l5-baseline', l5Ready, l5Ready ? surfBefore : 'UI 面基线采集失败');

// 1.5) 真实宿主证据 before（宿主观察，不重启）
const obsFile = join(parent, '.' + name + '-observation.json');
const evFile = join(parent, '.' + name + '-host-evidence.json');
const before = runNode('host-observe.mjs', ['before', profileDir, name, '--mini', mini, '--out', obsFile], 120000);
step('host-observe-before', before.code === 0, before.code === 0 ? obsFile : (before.out.trim().split('\n').pop() || ''));

// 2) 装 + 六级（--keep 保留，下一步才卸）
const trial = runNode('sandbox-trial.mjs', [profileDir, outDir, '--json', '--keep', '--mini', mini]);
const trialJson = jsonOf(trial.out);
state.claim = trialJson ? trialJson.claim : 'unknown';
state.phase = 'installed';
const claim = state.claim;
state.levels = trialJson ? trialJson.levels : null;
const levels = state.levels;
step('install+verify', Boolean(trialJson && trialJson.ok), claim, { levels });
let pkgAfterTrial = null;
try { pkgAfterTrial = readFileSync(pkgPath0, 'utf8'); } catch {}
state.installedByUs = hasTrialChanges({ originalPkg, currentPkg: pkgAfterTrial, preexistingDir: preexisting.dir, dirExists: existsSync(nm0) });

// 2.5) after：试装过程已重启过宿主，这里采集「新启动 + 路由内容」证据
const afterObs = runNode('host-observe.mjs', ['after', profileDir, name, '--mini', mini, '--input', obsFile, '--out', evFile, '--route', '/' + name], 180000);
step('host-observe-after', afterObs.code === 0, afterObs.code === 0 ? evFile : (afterObs.out.trim().split('\n').pop() || ''));

// 2.7) 用真实宿主证据再判一次 L2/L3（claim 应升级或至少证据来源变成 host）
let hostClaim = null;
if (afterObs.code === 0) {
  // 取一个不重启的 token，这样 L3/L4/L5 都能连活宿主判；L2 由宿主证据判
  const tokenReload = runNode('lab-reload.mjs', ['--no-restart', '--json'], 180000);
  const live = jsonOf(tokenReload.out);
  const vlArgs = [profileDir, '--pkg', name, '--host-evidence', evFile, '--expect', name, '--json'];
  if (live && live.ok) vlArgs.push('--base', 'http://127.0.0.1:' + live.port, '--token', live.token);
  if (l5Ready) vlArgs.push('--surfaces-before', surfBefore);
  const rv = runNode('verify-live.mjs', vlArgs, 300000);
  const rj = jsonOf(rv.out);
  hostClaim = rj && rj.claim;
  // 必须六层全 pass 且 claim 达标；只看 L2 会让 L3/L4/L5 的失败被吞掉（审查 P0-2）
  const verdict = judgeVerify(rj);
  step('verify-with-host-evidence', verdict.ok, (hostClaim || 'unknown') + ' / ' + verdict.reason.slice(0, 60));
}


// 3) 卸载：从 bundles/deps 移除 + 删目录（真实回滚，不是只回滚配置）
const pkgPath = join(profileDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const beforeBundles = (pkg.dsh?.profile?.bundles || []).length;
pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles || []).filter((x) => x !== name);
if (pkg.dependencies) delete pkg.dependencies[name];
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const nm = join(profileDir, 'node_modules', name);
if (existsSync(nm)) rmSync(nm, { recursive: true, force: true });
const uninstalled = !existsSync(nm) && !pkg.dsh.profile.bundles.includes(name) && !pkg.dependencies?.[name];
if (uninstalled) state.installedByUs = false;
step('uninstall', uninstalled && pkg.dsh.profile.bundles.length === beforeBundles - 1,
  'bundles ' + beforeBundles + '→' + pkg.dsh.profile.bundles.length + '，node_modules/' + name + (existsSync(nm) ? ' 仍在' : ' 已删'));

// 4) 重启后确认它真的不在了（路由 404 + dump-config 无它）
const reload = runNode('lab-reload.mjs', ['--mini', mini, '--json'], 300000);
const live = jsonOf(reload.out);
let after = { route: null, inDump: null };
state.after = after;
if (live && live.ok) {
  const u = 'http://127.0.0.1:' + live.port + '/' + name;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(u, { signal: ctrl.signal });
    after.route = res.status;
    clearTimeout(timer);
  } catch (e) { after.route = 0; }
  try {
    const dump = execFileSync(process.execPath, [dshBin, 'mini', '--dump-config'], { encoding: 'utf8', timeout: 180000, env: Object.assign({}, process.env, { DSH_HOME: join(mini, 'home') }) });
    after.inDump = dump.includes(name);
  } catch (e) { after.inDump = null; }
}
state.after = after;
step('rollback-verified', after.route === 404 && after.inDump === false, '路由 ' + after.route + '，dump-config 里 ' + (after.inDump === false ? '已无' : String(after.inDump)), { after });
// 5) 落成机器可读证据
const overall = judgeAcceptance(steps);
const ok = overall.ok;
state.ok = ok;
if (!ok) console.log('验收未通过：' + overall.reason);
function flushEvidence(extra) {
const evidence = {
  kind: 'mini-acceptance@1',
  at: new Date().toISOString(),
  name, mini, profile: profileDir,
  claim: state.claim, levels: state.levels,
  rollback: state.after,
  steps,
  ok: state.ok,
  phase: state.phase,
  rollbackOwnChanges: state.rollback,
  note: '这是真实 mini 的证据；不等同桌面端验收。',
  ...(extra || {}),
};
const outFile = val('--out') || join(process.env.DSH_TURNSTILE_STATE || join(mini, 'state'), 'acceptance', 'mini-' + name + '.json');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(evidence, null, 2) + '\n');
evidence.evidencePath = outFile;

if (has('--json')) console.log(JSON.stringify(evidence, null, 2));
else {
  for (const s of steps) console.log('  ' + (s.ok ? '✓' : '✗') + ' ' + s.id.padEnd(18) + (s.ok ? 'pass' : 'FAIL') + '  ' + String(s.detail).slice(0, 70));
  console.log('');
  console.log((state.ok ? '验收通过' : '验收未通过') + ' · 证据：' + outFile);
}
return { ok: state.ok, outFile };
}

// 正常结束
const flushed = flushEvidence();
process.exitCode = flushed.ok ? 0 : 1;
