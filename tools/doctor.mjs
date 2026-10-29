#!/usr/bin/env node
// tools/doctor.mjs — one command, the whole picture of a DSH profile.
// usage: node tools/doctor.mjs <profileName> [--home <DSH_HOME>] [--budget <bytes>]
//        node tools/doctor.mjs --dir <profileDir>
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT as root, DSH_BIN, DSH_HOME } from './config.mjs';
const yaml = createRequire(join(root, 'package.json'))('js-yaml');
const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => String(d) });
const schema = yaml.DEFAULT_SCHEMA.extend([jsType]);
const argv = process.argv.slice(2);
let profileName = null, home = process.env.DSH_HOME || null, dir = null, budget = Number(process.env.DSH_BUDGET_LIMIT || 4194304);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--home') home = argv[++i];
  else if (argv[i] === '--dir') dir = argv[++i];
  else if (argv[i] === '--budget') budget = Number(argv[++i]);
  else if (!profileName) profileName = argv[i];
}
if (dir) { profileName = dir.split(/[\\/]/).pop(); home = dirname(dirname(dir)); }
if (!profileName) { console.error('usage: node tools/doctor.mjs <profileName> [--home <DSH_HOME>]'); process.exit(2); }
if (!home) home = join(root, 'home');
const profileDir = join(home, 'profiles', profileName);
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
console.log('   bundles ' + bundles.length + '   deps ' + deps.length + '   composed ' + dumpBytes + ' B = ' + (100 * dumpBytes / budget).toFixed(1) + '% of ' + budget);
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
const surfaces = new Map();
const addS = (ui, who) => { if (!surfaces.has(ui)) surfaces.set(ui, new Set()); surfaces.get(ui).add(who); };
for (const name of bundles) {
  const d = join(profileDir, 'node_modules', name);
  if (!existsSync(join(d, 'package.json'))) continue;
  const j = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  for (const inj of (j.dsh?.client?.inject || [])) if (/ui-/.test(inj)) addS(inj.replace('@deepseek-ai/dsh-client-', ''), name);
  const patch = j.dsh?.bundle?.patch;
  if (patch) {
    const pf = join(d, patch.replace(/^\.\//, ''));
    if (existsSync(pf)) for (const m of readFileSync(pf, 'utf8').matchAll(/^\s*-?\s*id:\s*(ui-[\w-]+)/gm)) addS(m[1], name);
  }
}
const srows = [...surfaces.entries()].map(([ui, s]) => [ui, [...s].sort()]).sort((a, b) => b[1].length - a[1].length);
const hot = srows.filter(([, w]) => w.length >= 3);
for (const [ui, who] of srows.slice(0, 6)) console.log('   ' + ui.padEnd(22) + String(who.length).padStart(2) + '  ' + who.slice(0, 4).join(', ') + (who.length > 4 ? ' +' + (who.length - 4) : ''));
console.log('   >=3 个插件抢占的界面: ' + hot.length + (hot.length ? '  ← 建议收进母按钮' : ''));
console.log(bar('引擎闸门'));
const skipped = [];
const semverOk = (range, ver) => {
  if (!range || !ver) return true;
  const parts = String(range).split('||').map(s => s.trim());
  const cmpKey = (v) => v.split(/[.+-]/).slice(0, 3).map(x => parseInt(x, 10) || 0);
  const ge = (a, b) => { const A = cmpKey(a), B = cmpKey(b); for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] > B[i]; } return true; };
  const lt = (a, b) => { const A = cmpKey(a), B = cmpKey(b); for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] < B[i]; } return false; };
  return parts.some(p => {
    const caret = p.match(/^\^(\S+)$/);
    if (caret) { const b = caret[1]; const [ma] = cmpKey(b); const up = ma > 0 ? (ma + 1) + '.0.0' : '0.' + (cmpKey(b)[1] + 1) + '.0'; return ge(ver, b) && lt(ver, up); }
    const tilde = p.match(/^~\s*(\S+)$/);
    if (tilde) { const c = cmpKey(tilde[1]); return ge(ver, tilde[1]) && lt(ver, c[0] + '.' + (c[1] + 1) + '.0'); }
    if (p.startsWith('>=') && !p.includes(' ')) return ver >= p.slice(2).replace(/\s/g, '');
    const m = p.match(/^>=\s*(\S+)\s*<\s*(\S+)$/);
    if (m) return ver >= m[1] && ver < m[2];
    return p === ver || p === '*' ;
  });
};
const hostVer = (() => { const j = createRequire(join(root, 'package.json'))('@deepseek-ai/dsh/package.json'); return j.version; })();
for (const name of bundles) {
  const d = join(profileDir, 'node_modules', name);
  if (!existsSync(join(d, 'package.json'))) continue;
  const j = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  const range = j.engines?.dsh;
  if (range && !semverOk(range, hostVer)) skipped.push(name + ' (' + range + ')');
}
console.log('   host ' + hostVer + '；会被跳过的: ' + (skipped.length ? skipped.join(', ') : '无'));
const warn = userOff.length + dups.length + hot.length + skipped.length;
const mapPath = join(root, 'state', 'gate-map-' + profileName + '.html');
if (existsSync(mapPath)) console.log('\n详细视图: ' + mapPath + '   (node tools/gate-map.mjs ' + profileName + ' 可刷新)');
else console.log('\n详细视图: 还没生成 —— 跑 node tools/gate-map.mjs ' + profileName + ' 会产出一张可点的拓扑图');
console.log('\n结论: ' + (warn === 0 ? '干净' : warn + ' 处需要看一眼') + '  (停用 ' + userOff.length + ' / 路由重名 ' + dups.length + ' / UI 抢占 ' + hot.length + ' / 引擎跳过 ' + skipped.length + ')');