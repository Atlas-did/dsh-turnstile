#!/usr/bin/env node
// 真机验证（P1.1）：不是再跑一次静态检查，而是回答「重启后它真的加载了吗」。
//   L0 静态 / L1 文件 / L2 加载（dump-config）/ L3 路由（HTTP）/ L4 UI（页面内容）/ L5 回归（health 对比）
// usage:
//   node tools/verify-live.mjs <profileName|profileDir> --pkg <name> [--routes /a,/b] [--expect 文本]
//        [--home <DSH_HOME>] [--dump-config-cmd <cmd>] [--base http://127.0.0.1:18770] [--token <t>] [--json]
//   缺 --base/--token 时，L3/L4/L5 记 unknown（如实标注，不编）。
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { layer as level, claimOf, verdictOf, renderReport, LEVELS, STATUS } from './lib/evidence.mjs';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const profileArg = argv.find((a) => !a.startsWith('--') && a !== val('--pkg') && a !== val('--routes') && a !== val('--expect') && a !== val('--home') && a !== val('--base') && a !== val('--token') && a !== val('--dump-config-cmd'));
if (!profileArg) { console.error('usage: node tools/verify-live.mjs <profile> --pkg <name>'); process.exit(2); }

const pkgName = val('--pkg');
const home = val('--home') || process.env.DSH_HOME || null;
const isPath = /[\\/]/.test(profileArg);
const profileDir = isPath ? profileArg : (home ? join(home, 'profiles', profileArg) : null);
const profileName = isPath ? basename(profileArg) : profileArg;
if (!profileDir || !existsSync(profileDir)) { console.error('profile 不存在：' + (profileDir || profileArg)); process.exit(2); }

const layers = [];

// ---- L0 静态：清单与配置能读、插件在 bundles 里
const pkgJson = join(profileDir, 'package.json');
const profilePkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
const bundles = profilePkg.dsh?.profile?.bundles || [];
const deps = Object.keys(profilePkg.dependencies || {});
const inBundles = pkgName ? bundles.includes(pkgName) : true;
const inDeps = pkgName ? deps.includes(pkgName) : true;
// bundles 才是「会不会被加载」的判据；deps 缺失只提示（本地 file: 插件常常不在 deps 里）
layers.push(level('L0', inBundles ? STATUS.pass : STATUS.fail,
  ['bundles ' + bundles.length + ' / deps ' + deps.length, pkgName ? (pkgName + (inBundles ? ' ∈ bundles' : ' ∉ bundles') + (inDeps ? ' / ∈ deps' : ' / ∉ deps（仅提示）')) : '(未指定 pkg)']));

// ---- L1 文件层：插件目录、entry、声明的路由
let entryFile = null;
if (pkgName) {
  const dir = join(profileDir, 'node_modules', pkgName);
  const pj = join(dir, 'package.json');
  if (existsSync(pj)) {
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    const cands = [p.main, p.browser, 'lib/client.js', 'dist/client.js', 'lib/index.js', 'index.js'].filter(Boolean);
    entryFile = cands.map((c) => join(dir, c)).find((f) => existsSync(f)) || null;
    layers.push(level('L1', entryFile ? STATUS.pass : STATUS.fail,
      ['node_modules/' + pkgName + ' 存在', entryFile ? 'entry: ' + entryFile.replace(profileDir, '') : '找不到入口文件']));
  } else {
    layers.push(level('L1', STATUS.fail, ['node_modules/' + pkgName + ' 不存在']));
  }
} else layers.push(level('L1', STATUS.skip, ['未指定 --pkg']));

// ---- 路由清单：从源码里找 path: "..."
let routes = (val('--routes') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!routes.length && entryFile) {
  try {
    const src = readFileSync(entryFile, 'utf8');
    // 只认 webServer.register 附近的 path（其它 path: 不是 HTTP 路由）
    for (const m of src.matchAll(/webServer[\s\S]{0,400}?/g)) {
      const seg = src.slice(m.index, m.index + 400);
      const p = /path:\s*["'](\/[^"']+)["']/.exec(seg);
      if (p) routes.push(p[1]);
    }
  } catch {}
}
routes = [...new Set(routes)].slice(0, 8);

// ---- 真实宿主证据（可选）：它能直接证明「重启后加载 + 路由内容」，比 dump-config 更硬。
// 给了就优先用它判定 L2/L3；无效则退回 dump/HTTP，并在 note 里说清为什么没用上。
let hostEv = null;
const hostEvFile = val('--host-evidence');
if (hostEvFile) {
  try {
    const raw = JSON.parse(readFileSync(hostEvFile, 'utf8'));
    const { validateHostEvidence } = await import('./lib/host-evidence.mjs');
    const v = validateHostEvidence(raw, { target: pkgName, profile: profileDir });
    hostEv = v.ok ? { ok: true, raw } : { ok: false, errors: v.errors };
  } catch (e) { hostEv = { ok: false, errors: [String(e.message).slice(0, 80)] }; }
}

// ---- L2 加载层：宿主组合后的配置里有没有它
let dump = '';
const dumpCmd = val('--dump-config-cmd');
const dshBin = val('--dsh-bin');
if (dshBin) {
  // 直接 execFile，不过 shell：避免 Windows 路径/引号把命令打散
  try {
    dump = execFileSync(process.execPath, [dshBin, profileName, '--dump-config'], { encoding: 'utf8', timeout: 180000, env: Object.assign({}, process.env, home ? { DSH_HOME: home } : {}) });
  } catch (e) { dump = String((e.stdout || '') + (e.stderr || '')); }
} else if (dumpCmd) {
  try { dump = execFileSync(dumpCmd, { shell: true, encoding: 'utf8', timeout: 120000, cwd: process.env.DSH_TURNSTILE_HOME || process.cwd() }); }
  catch (e) { dump = String((e.stdout || '') + (e.stderr || '')); }
}
if (!pkgName) layers.push(level('L2', STATUS.skip, ['未指定 --pkg']));
else if (hostEv && hostEv.ok) {
  const h = hostEv.raw.host || {};
  const r = hostEv.raw.restart || {};
  layers.push(level('L2', STATUS.pass, ['host-evidence：bootId ' + String(r.beforeBootId).slice(0, 6) + '→' + String(r.afterBootId).slice(0, 6) + ' 已重启', 'bundles 确认：' + (hostEv.raw.bundles && hostEv.raw.bundles.confirmed ? '是' : '否'), 'runtime ' + (h.runtimeVersion || '')]));
}
else if (!dump.trim()) layers.push(level('L2', STATUS.unknown, [(hostEv ? 'host-evidence 无效（' + (hostEv.errors || []).join('；').slice(0, 60) + '），' : '') + '也没给 --dump-config-cmd，无法证明宿主加载']));
else {
  const hit = dump.split(/\r?\n/).filter((l) => l.includes(pkgName)).slice(0, 3);
  const fatal = /fatal|uncaught|cannot find module/i.test(dump) ? '组合时出现致命错误' : '';
  layers.push(level('L2', hit.length && !fatal ? STATUS.pass : STATUS.fail,
    [hit.length ? 'dump-config 命中：' + hit[0].trim().slice(0, 60) : 'dump-config 里没有 ' + pkgName, fatal]));
}

// ---- L3/L4/L5 需要活宿主
const base = (val('--base') || '').replace(/\/+$/, '');
const token = val('--token') || '';
async function get(path) {
  const u = base + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
  // 不用 AbortSignal.timeout：Node 25 在进程退出时会触发 libuv 断言
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(u, { signal: ctrl.signal });
    return { status: r.status, text: await r.text() };
  } finally { clearTimeout(timer); }
}
const live = Boolean(base && token);
let routeResults = [];
if (!live) {
  // 没有活宿主连接时，真实宿主证据里的路由结果可以替代（它同样是真 HTTP 得到的）
  const evRoute = hostEv && hostEv.ok ? (hostEv.raw.route || null) : null;
  if (evRoute && evRoute.path && evRoute.status >= 200 && evRoute.status < 400) {
    layers.push(level('L3', STATUS.pass, ['host-evidence：' + evRoute.path + ' → ' + evRoute.status + '（sha256 ' + String(evRoute.bodySha256 || '').slice(0, 8) + '…，' + (evRoute.bodyBytes || 0) + ' 字节）']));
  } else {
    layers.push(level('L3', STATUS.unknown, ['没有 --base/--token：未连活宿主，路由未验证', evRoute ? '（证据里的路由 ' + evRoute.path + ' → ' + evRoute.status + '，不算通过）' : '']));
  }
} else if (!routes.length) {
  layers.push(level('L3', STATUS.skip, ['没有可测路由（源码里没找到 path:）']));
} else {
  for (const r of routes) {
    try { const res = await get(r); routeResults.push({ route: r, status: res.status, ok: res.status >= 200 && res.status < 400, body: res.text }); }
    catch (e) { routeResults.push({ route: r, status: 0, ok: false, body: '', error: String(e.message).slice(0, 60) }); }
  }
  const bad = routeResults.filter((x) => !x.ok);
  layers.push(level('L3', bad.length ? STATUS.fail : STATUS.pass,
    routeResults.map((x) => x.route + ' → ' + (x.status || 'ERR'))));
}

const expect = val('--expect');
if (!live) layers.push(level('L4', STATUS.unknown, ['未连活宿主，界面未验证']));
else if (!expect) layers.push(level('L4', STATUS.unknown, ['没给 --expect，界面内容无法判定']));
else {
  const ok = routeResults.filter((x) => x.ok && x.body.includes(expect));
  layers.push(level('L4', ok.length ? STATUS.pass : STATUS.fail,
    [ok.length ? ok[0].route + ' 含「' + expect + '」' : '所有路由页面都不含「' + expect + '」']));
}

// L5 回归：health + UI 面差异（给了 --surfaces-before 才比，没给就明说没比）
const beforeFile = val('--surfaces-before');
let surfNote = null;
if (beforeFile && existsSync(beforeFile)) {
  try {
    const { scanUi, surfaceCounts } = await import('./lib/ui-scan.mjs');
    const rawBefore = JSON.parse(readFileSync(beforeFile, 'utf8'));
    // baseline 允许两种形状：[{surface,plugins}] 或 {surface:[plugins]}
    const beforeMap = Array.isArray(rawBefore)
      ? rawBefore.map((x) => [x.surface, x.plugins || []])
      : Object.entries(rawBefore);
    const afterMap = new Map(surfaceCounts(scanUi(profileDir)).map((x) => [x.surface, x.plugins || []]));
    const lost = [];
    for (const [face, list] of beforeMap) {
      const nowSet = new Set(afterMap.get(face) || []);
      for (const p of list) if (!nowSet.has(p)) lost.push(face + '←' + p);
    }
    surfNote = lost.length ? { ok: false, text: '原有插件从 UI 面消失：' + lost.slice(0, 3).join(', ') } : { ok: true, text: 'UI 面回归：无插件消失' };
  } catch (e) { surfNote = { ok: null, text: 'UI 面基线读不了：' + String(e.message).slice(0, 40) }; }
}
if (!live) layers.push(level('L5', STATUS.unknown, ['未连活宿主，回归未测', surfNote && surfNote.text]));
else {
  try {
    const h = await get('/turnstile/health');
    const j = JSON.parse(h.text);
    const items = j.items || [];
    const bad = items.filter((i) => i.level === 'fail');
    const surfBad = surfNote && surfNote.ok === false;
    layers.push(level('L5', bad.length || surfBad ? STATUS.fail : STATUS.pass,
      [items.map((i) => i.id + '=' + i.level).join(' '), surfNote && surfNote.text]));
  } catch (e) { layers.push(level('L5', STATUS.unknown, ['health 读不到：' + String(e.message).slice(0, 50)])); }
}

const claim = claimOf(layers);
const report = renderReport({ pkg: pkgName || '(未指定)', profile: profileName, layers, claim, verdict: verdictOf(layers) });
const shaped = Object.assign({
  ok: report.verdict !== 'fail', verdict: report.verdict, command: 'verify-live',
  summary: report.summary, findings: [], evidence: [],
  next: report.deepest === 'L5' ? [] : [{ label: '看下一层怎么验', command: 'node tools/verify-live.mjs ' + profileName + ' --pkg ' + (pkgName || '<pkg>') + ' --json', mutating: false, reason: '当前只到 ' + (report.deepest || '无') }],
}, report);
// 用 exitCode 而不是 process.exit()：Node 25 里 fetch 未清干净时强制退出会触发 libuv 断言
if (has('--json')) { console.log(JSON.stringify(shaped, null, 2)); process.exitCode = report.verdict === 'fail' ? 1 : 0; }

console.log('真机验证 · ' + (pkgName || '(全部)') + ' @ ' + profileName);
for (const l of layers) {
  const meta = LEVELS.find((x) => x.id === l.level);
  const mark = l.status === 'pass' ? '✓' : l.status === 'fail' ? '✗' : '·';
  console.log('  ' + mark + ' ' + l.level + ' ' + meta.name.padEnd(6) + ' ' + l.status + (l.evidence.length ? '  ' + l.evidence[0].slice(0, 64) : ''));
}
console.log('');
console.log('结论：' + claim.text);
if (!has('--json')) process.exitCode = report.verdict === 'fail' ? 1 : 0;
