#!/usr/bin/env node
// A1：在沙盒里試一个插件，試完给出结论，默认自动还原。
//
// 流程（每一步失败就停，并如实记录）：
//   1. 快照（sandbox-snapshot --take）
//   2. 装前检查（preinstall：同族/双市场/git 依赖）
//   3. 装：拷进 node_modules，写 file: 依赖与 bundles，patch 里加 override 行
//   4. 验证：patch 可解析、client bundle 可解析、engines（有 DSH_BIN 时）、HTTP health（沙盒在跑时）
//   5. 记录 journal；除非 --keep，否则回滚到快照
//
// usage: node tools/sandbox-trial.mjs <profileDir> <pluginDir> [--keep] [--port 18770] [--state <dir>]
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadYaml } from './config.mjs';
import { copyTreeSafe } from './safe-copy.mjs';

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const [profileDir, pluginDir] = args;
if (!profileDir || !pluginDir) { console.error('usage: node tools/sandbox-trial.mjs <profileDir> <pluginDir> [--keep] [--port 18770]'); process.exit(2); }
if (!existsSync(join(profileDir, 'package.json'))) { console.error('not a profile: ' + profileDir); process.exit(2); }
if (!existsSync(join(pluginDir, 'package.json'))) { console.error('not a plugin: ' + pluginDir); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const state = val('--state') || process.env.DSH_TURNSTILE_STATE || join(profileDir, '..', '..', 'turnstile-state');
const env = { ...process.env, DSH_TURNSTILE_STATE: state };
const run = (script, extra) => {
  // 用相对本文件的路径：之前是 join('tools', script)，不在仓库根目录跑就必挂（外部调研 #4）
  const here = dirname(fileURLToPath(import.meta.url));
  try { return { code: 0, out: execFileSync(process.execPath, [join(here, script), ...extra], { encoding: 'utf8', env, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};
const journal = (fields) => run('lab-journal.mjs', ['--add', ...fields]);
const name = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name;
if (!name) { console.error('插件 package.json 没有 name'); process.exit(2); }

console.log('== trial ' + name + '  →  ' + profileDir);
const snap = run('sandbox-snapshot.mjs', [profileDir, '--take', '--label', 'trial ' + name, '--state', state]);
const snapLines = snap.out.trim().split(/\r?\n/);
const snapReason = snapLines.find((line) => /Error:|ENOTDIR|EEXIST|EACCES|EPERM/.test(line)) || snapLines[0] || 'unknown';
console.log('1. 快照 ' + (snap.code === 0 ? snap.out.trim() : '失败：' + snapReason));
if (snap.code !== 0) {
  // 状态目录本身可能不可写；不要再向同一个位置写 journal，造成第二段堆栈。
  console.error('结论：已停止，未安装；没有可用快照就不修改 profile（本次也无法写入实验记录）。');
  process.exit(4);
}

const pre = run('preinstall.mjs', [profileDir, name, '--json']);
let preJson = null; try { preJson = JSON.parse(pre.out); } catch {}
const blockers = (preJson && preJson.findings || []).filter((f) => /同族|市场/.test(f.text));
if (blockers.length) {
  console.log('2. 装前检查：有风险');
  for (const b of blockers) console.log('   ! ' + b.text + ' → ' + b.next);
  journal(['--kind', 'trial', '--target', name, '--verdict', 'blocked', '--note', blockers[0].text]);
  run('sandbox-snapshot.mjs', [profileDir, '--restore', 'latest', '--state', state]);
  process.exit(3);
}
console.log('2. 装前检查：无阻断项');

// 3. 装
const nm = join(profileDir, 'node_modules', name);
mkdirSync(join(profileDir, 'node_modules'), { recursive: true });
rmSync(nm, { recursive: true, force: true });
copyTreeSafe(pluginDir, nm);
const pkgPath = join(profileDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies[name] = 'file:./node_modules/' + name;
pkg.dsh = pkg.dsh || {}; pkg.dsh.profile = pkg.dsh.profile || {}; pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
if (!pkg.dsh.profile.bundles.includes(name)) pkg.dsh.profile.bundles.push(name);
copyFileSync(pkgPath, pkgPath + '.bak-trial-' + Date.now());
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('3. 已装进 node_modules 并写进 bundles');

// 4. 验证
// 4a. 真机六级验证：这是「试装通过」的新定义（P1.1）。没有证据就记 unknown，不补绿。
const verifyArgs = [join(here, 'verify-live.mjs'), profileDir, '--pkg', name, '--json'];
// --mini：一条命令搞定「重启 → 取新 token → 用真宿主验证」（token 每次重启都变，人工捞太蠢）
if (has('--mini')) {
  const miniArg = (val('--mini') && val('--mini') !== 'true') ? val('--mini') : '';
  const reloadArgs = [join(here, 'lab-reload.mjs'), '--json'];
  if (miniArg) reloadArgs.push('--mini', miniArg);
  let live = null;
  try {
    const out = execFileSync(process.execPath, reloadArgs, { encoding: 'utf8', timeout: 300000 });
    live = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  } catch (e) {
    const s = String((e.stdout || '') + (e.stderr || ''));
    try { live = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { live = null; }
  }
  if (live && live.ok) {
    verifyArgs.push('--base', 'http://127.0.0.1:' + live.port, '--token', live.token);
    const dshBin = join(miniArg || '', 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (dshBin && existsSync(dshBin)) verifyArgs.push('--dsh-bin', dshBin);
    const miniHome = join(miniArg || '', 'home');
    if (existsSync(miniHome)) verifyArgs.push('--home', miniHome);
    // 页面断言：用包名当文本（新脚手架一定会把包名写进页面）
    verifyArgs.push('--expect', name, '--routes', '/' + name);
    console.log('   已重启 mini 并取到新 token（' + live.readyMs + 'ms）');
  } else console.log('   ⚠ mini 重启没就绪，本次只能验到文件层');
}
for (const [flag, key] of [['--dsh-bin', 'dsh-bin'], ['--base', 'base'], ['--token', 'token'], ['--expect', 'expect'], ['--routes', 'routes'], ['--surfaces-before', 'surfaces-before']]) {
  const v = val(flag);
  if (v) verifyArgs.push(flag, v);
}
if (has('--restart-cmd')) {
  const rc = val('--restart-cmd');
  try { execFileSync(process.platform === 'win32' ? 'cmd' : 'sh', process.platform === 'win32' ? ['/c', rc] : ['-c', rc], { stdio: 'inherit', timeout: 180000 }); }
  catch (e) { console.log('   ⚠ 重启命令失败：' + String(e.message).slice(0, 60)); }
}
let levelReport = null;
try {
  const vout = execFileSync(process.execPath, verifyArgs, { encoding: 'utf8', timeout: 300000 });
  levelReport = JSON.parse(vout.slice(vout.indexOf('{'), vout.lastIndexOf('}') + 1));
} catch (e) {
  const s = String((e.stdout || '') + (e.stderr || ''));
  try { levelReport = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { levelReport = null; }
}

const checks = [];
const py = run('profile-yaml.mjs', [profileDir]);
checks.push(['profile-yaml', py.code === 0, py.out.trim().split('\n')[0]]);
const { yaml, schema } = loadYaml();
let parses = true;
try { yaml.load(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8'), { schema }); } catch { parses = false; }
checks.push(['patch-parses', parses, parses ? 'ok' : 'cordis.patch.yml 无法解析']);
const port = val('--port');
if (port) {
  let health = '0';
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/turnstile/health', { signal: AbortSignal.timeout(5000) });
    health = String(response.status);
  } catch { health = '0'; }
  checks.push(['http-health', health === '200' || health === '401', 'status=' + health + '（仅证明宿主响应；401=需要 token）']);
}
console.log('4. 验证：');
for (const [n, okk, detail] of checks) console.log('   ' + (okk ? 'ok  ' : 'FAIL') + ' ' + n.padEnd(14) + detail);
console.log('   SKIP plugin-load  本工具没有重启真实宿主，不能把静态检查或 http-health 当作插件已加载')
if (levelReport) {
  for (const l of levelReport.levels || []) {
    const mark = l.status === 'pass' ? '✓' : l.status === 'fail' ? '✗' : '·';
    console.log('   ' + mark + ' ' + l.level + ' ' + l.status + (l.evidence && l.evidence.length ? '  ' + String(l.evidence[0]).slice(0, 60) : ''));
  }
} else {
  console.log('   · 六级验证没跑成（检查 --dsh-bin / --base / --token）——本次不能声称真实可用');
}
const passed = checks.every(([, okk]) => okk) && (!levelReport || levelReport.verdict !== 'fail');
const claimText = levelReport ? levelReport.claimText : '只做了文件层检查，未验证真实运行。';
const verdictWord = levelReport ? levelReport.claim : (passed ? 'static-only' : 'failed');

let rollbackOk = true;
if (!has('--keep')) {
  const restored = run('sandbox-snapshot.mjs', [profileDir, '--restore', 'latest', '--state', state]);
  rollbackOk = restored.code === 0;
  rmSync(nm, { recursive: true, force: true });
  console.log('5. ' + (rollbackOk ? '已回滚' : '回滚失败：' + restored.out.trim()) + '（--keep 可保留）');
} else console.log('5. 保留安装（--keep）；仍需要真实宿主重启验证');
passed = passed && rollbackOk;

journal(['--kind', 'trial', '--target', name, '--verdict', passed ? 'static-pass' : 'fail', '--note', claimText]);
if (has('--json')) console.log(JSON.stringify({ ok: passed, claim: verdictWord, claimText, levels: levelReport ? levelReport.levels : null, checks: checks.map(([n, okk, d]) => ({ name: n, ok: okk, detail: d })) }, null, 2));
console.log('结论（' + verdictWord + '）：' + claimText);process.exitCode = passed ? 0 : 1;
