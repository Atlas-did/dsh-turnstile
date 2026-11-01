#!/usr/bin/env node
// tools/doctor.mjs — one command, the whole picture of a DSH profile.
// usage: node tools/doctor.mjs <profileName> [--home <DSH_HOME>] [--budget <bytes>]
//        node tools/doctor.mjs --dir <profileDir>
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT as root, DSH_BIN, DSH_HOME, loadYaml } from './config.mjs';
import { scanUi } from './lib/ui-scan.mjs';
import { checkCompatibility, runtimeVersion } from './version.mjs';
import { patchFiles } from './lib/patch-files.mjs';
// 缺依赖时不能顶层崩（外部审查：那会让「环境问题」冒充 verdict:fail + 一行文件路径）
let yaml, schema;
try {
  ({ yaml, schema } = loadYaml());
} catch (e) {
  const missing = e && e.code === 'MISSING_DEPENDENCY';
  const msg = '缺少依赖 ' + ((e && e.dependency) || 'js-yaml') + '：在仓库根跑 `npm install`（离线可 `npm install --offline`）。这是环境问题，不是插件有问题。';
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      profile: process.argv.slice(2).find((a) => !a.startsWith('--')) || '',
      verdict: 'unknown', skipped: true, skipReason: missing ? 'missing-dependency' : 'load-error',
      summary: msg, findings: [],
      next: [{ label: '装依赖后重试', command: 'npm install', mutating: false, reason: '缺依赖' }],
    }, null, 2));
    process.exit(3);
  }
  console.error(msg);
  process.exit(3);
}
const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => String(d) });

const argv = process.argv.slice(2);
// --json 时先静音所有人类可读输出，最后只打一份 JSON（agent 读的），避免文本+JSON 混排
const jsonMode = process.argv.includes('--json');
const realLog = console.log.bind(console);
if (jsonMode) console.log = function () {};
let profileName = null, home = process.env.DSH_HOME || null, dir = null, budget = Number(process.env.DSH_BUDGET_LIMIT || 4194304);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--home') home = argv[++i];
  else if (argv[i] === '--dir') dir = argv[++i];
  else if (argv[i] === '--budget') budget = Number(argv[++i]);
  else if (!profileName) profileName = argv[i];
}
// B9: a path given positionally means the same thing as --dir (preflight/manage accept paths,
// so doctor rejecting one was an inconsistency, not a policy).
if (!dir && profileName && /[\\/]/.test(profileName) && existsSync(profileName)) dir = profileName;
if (dir) { profileName = dir.split(/[\\/]/).pop(); home = dirname(dirname(dir)); }
// 给了 --dir / 位置路径就直接用它，别再拼 <home>/profiles/<name>（否则传目录必挂）
if (!profileName) { console.error('usage: node tools/doctor.mjs <profileName> [--home <DSH_HOME>]'); process.exit(2); }
if (!home) home = join(root, 'home');
const profileDir = dir || join(home, 'profiles', profileName);
const bar = (t) => '\n== ' + t + ' ' + '='.repeat(Math.max(0, 62 - t.length));
console.log('doctor · ' + profileName + '  (' + profileDir + ')');
if (!existsSync(profileDir)) { console.error('profile not found: ' + profileDir); process.exit(2); }
const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const deps = Object.keys(pj.dependencies || {});
const bundles = pj.dsh?.profile?.bundles || [];
let dumpText = '';
try {
  dumpText = execFileSync(process.execPath, [DSH_BIN, profileName, '--dump-config'],
    { env: { ...process.env, DSH_HOME: home }, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
} catch (e) { dumpText = ''; }
let rows = [];
try { rows = yaml.load(dumpText, { schema }) || []; } catch (e) { rows = []; }
const dumpBytes = Buffer.byteLength(dumpText);
// B10: a failed composition is UNKNOWN, not zero bytes - reporting 0% of budget reads as healthy.
if (!dumpBytes) {
  console.log('   bundles ' + bundles.length + '   deps ' + deps.length + '   composed unknown (no --dump-config; set DSH_BIN)');
} else {
  console.log('   bundles ' + bundles.length + '   deps ' + deps.length + '   composed ' + dumpBytes + ' B = ' + (100 * dumpBytes / budget).toFixed(1) + '% of ' + budget);
}
console.log(bar('已停用'));
const patchPath = join(profileDir, 'cordis.patch.yml');
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
const userOff = [...patchText.matchAll(/- id:\s*([\w.@/-]+)[\s\S]{0,80}?disabled:\s*true/g)].map(m => m[1]);
const allOff = rows.filter(r => r && r.disabled === true).map(r => r.id);
console.log('   你手动停用的: ' + (userOff.length ? userOff.join(', ') : '(无)'));
console.log('   dump 里 disabled 行合计: ' + allOff.length + '（含 bundle 自带的默认停用）');
console.log(bar('闸门账本'));
const histPath = join(root, 'state/gate-history.json');
if (existsSync(histPath)) {
  const h = JSON.parse(readFileSync(histPath, 'utf8'));
  const runs = h.runs || [];
  const realDir = (() => { try { return realpathSync.native(profileDir).split(String.fromCharCode(92)).join('/').toLowerCase(); } catch { return profileDir.split(String.fromCharCode(92)).join('/').toLowerCase(); } })();
  const mine = runs.filter(r => {
    const rp = String(r.profile || '');
    if (!rp) return false;
    let norm = rp;
    try { norm = realpathSync.native(rp); } catch { /* keep */ }
    norm = norm.split(String.fromCharCode(92)).join('/').toLowerCase();
    return norm === realDir;
  });
  const last = mine[mine.length - 1];
  console.log('   总运行 ' + runs.length + '，本 profile ' + mine.length + '，决策 ' + (h.decisions || []).length);
  if (last) console.log('   最近一次: ' + last.at + '  ' + last.result + '  (' + (last.checks || []).filter(c => c.ok).length + '/' + (last.checks || []).length + ' 通过)');
  else console.log('   本 profile 还没有闸门记录');
} else console.log('   (没有 state/gate-history.json)');
console.log(bar('模型路由'));
const routes = [];
for (const r of rows) {
  const c = r.config || {};
  if (Array.isArray(c.models) && c.models.length) routes.push({ route: r.id, baseURL: c.baseURL || '(default)', models: c.models.map(m => m.id || m).filter(Boolean) });
  if (c.providers && typeof c.providers === 'object') for (const [pid, pv] of Object.entries(c.providers)) routes.push({ route: r.id + ':' + pid, baseURL: (pv && pv.baseURL) || '(builtin)', models: ((pv && pv.models) || []).map(m => m.id || m).filter(Boolean) });
}
const own = new Map();
for (const r of routes) for (const id of r.models) { if (!own.has(id)) own.set(id, new Set()); own.get(id).add(r.route); }
const dups = [...own.entries()].filter(([, s]) => s.size > 1);
for (const r of routes) console.log('   ' + r.route.padEnd(30) + String(r.models.length).padStart(3) + '  ' + r.baseURL);
console.log('   跨路由重名: ' + dups.length + (dups.length ? '  ' + dups.map(([id]) => id).join(', ') : ''));
console.log(bar('UI 抢占'));
// 口径来自 tools/lib/ui-scan.mjs（唯一实现）；doctor 只把面名缩成短名显示。
const uiScan = scanUi(profileDir, { onlyUiSurfaces: true });
const surfaces = new Map();
for (const [full, plugins] of uiScan.surfaces) {
  const short = String(full).replace('@deepseek-ai/dsh-client-', '');
  surfaces.set(short, new Set(plugins));
}
const srows = [...surfaces.entries()].map(([ui, s]) => [ui, [...s].sort()]).sort((a, b) => b[1].length - a[1].length);
const hot = srows.filter(([, w]) => w.length >= 3);
for (const [ui, who] of srows.slice(0, 6)) console.log('   ' + ui.padEnd(22) + String(who.length).padStart(2) + '  ' + who.slice(0, 4).join(', ') + (who.length > 4 ? ' +' + (who.length - 4) : ''));
console.log('   >=3 个插件抢占的界面: ' + hot.length + (hot.length ? '  ← 建议收进母按钮' : ''));
console.log(bar('引擎闸门'));
const skipped = [];
const hostVer = runtimeVersion;
for (const name of bundles) {
  const d = join(profileDir, 'node_modules', name);
  if (!existsSync(join(d, 'package.json'))) continue;
  const j = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  const range = j.engines?.dsh;
  const issue = range ? checkCompatibility({ name, version: j.version, engines: { dsh: range } }) : null;
  if (issue) skipped.push(name + ' (' + range + ')');
}
console.log('   host ' + hostVer + '；会被跳过的: ' + (skipped.length ? skipped.join(', ') : '无'));
const warn = userOff.length + dups.length + hot.length + skipped.length;

// --json：给 agent 读的统一形状（doctor 的发现就是「停用 / 路由重名 / UI 抢占 / 引擎跳过」四类）
if (process.argv.includes('--json')) {
  const findings = [];
  for (const n of skipped) findings.push({ checker: 'engines', severity: 'error', id: 'engine-skip', title: n + ' 会被引擎闸门跳过', evidence: ['engines.dsh 不满足当前运行时'], falsifier: '运行时升级/降级到该范围后，本条消失' });
  for (const d of dups) findings.push({ checker: 'providers', severity: 'warn', id: 'route-dup-' + d[0], title: '模型 id ' + d[0] + ' 在 ' + d[1].size + ' 个路由重复', evidence: [...d[1]], falsifier: '只保留一个路由里的该模型即为误报' });
  for (const h of hot) findings.push({ checker: 'ui-surface', severity: 'warn', id: 'ui-hot-' + h[0], title: h[0] + ' 被 ' + h[1] + ' 个插件注入', evidence: ['ui-scan surfaces'], falsifier: '把其中一个插件换到别的面后，本条消失' });
  for (const off of userOff) findings.push({ checker: 'manage', severity: 'warn', id: 'disabled-' + off, title: off + ' 被手动停用', evidence: ['cordis.patch.yml disabled:true'], falsifier: '启用后本条消失' });
  realLog(JSON.stringify({
    profile: profileName, runtime: hostVer,
    verdict: warn === 0 ? 'ok' : (skipped.length ? 'fail' : 'warn'),
    summary: warn === 0 ? '干净' : warn + ' 处需要看一眼（停用 ' + userOff.length + ' / 路由重名 ' + dups.length + ' / UI 抢占 ' + hot.length + ' / 引擎跳过 ' + skipped.length + '）',
    findings, next: warn === 0 ? [] : [{ label: '看完整闸门', command: 'node tools/turnstile.mjs gate <profile> --json', mutating: false, reason: 'doctor 是概览，gate 有逐项检查' }],
  }, null, 2));
  process.exit(skipped.length ? 1 : 0);
}
const mapPath = join(root, 'state', 'gate-map-' + profileName + '.html');
if (existsSync(mapPath)) console.log('\n详细视图: ' + mapPath + '   (node tools/gate-map.mjs ' + profileName + ' 可刷新)');
else console.log('\n详细视图: 还没生成 —— 跑 node tools/gate-map.mjs ' + profileName + ' 会产出一张可点的拓扑图');
console.log('\n结论: ' + (warn === 0 ? '干净' : warn + ' 处需要看一眼') + '  (停用 ' + userOff.length + ' / 路由重名 ' + dups.length + ' / UI 抢占 ' + hot.length + ' / 引擎跳过 ' + skipped.length + ')');