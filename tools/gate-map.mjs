#!/usr/bin/env node
// tools/gate-map.mjs — render the gate's findings as one self-contained HTML page.
// Shows: layer stack (who wrote each row last), UI surface crowding, model routes,
// and the gate timeline. Every node carries a file path so findings are traceable.
// usage: node tools/gate-map.mjs <profileName> [--home <DSH_HOME>] [--out <file.html>]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT as root, DSH_BIN, DSH_HOME, loadYaml } from './config.mjs';
import { checkCompatibility, runtimeVersion } from './version.mjs';
const { yaml, schema } = loadYaml();
const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => String(d) });

const argv = process.argv.slice(2);
let profileName = null, home = process.env.DSH_HOME || null, out = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--home') home = argv[++i];
  else if (argv[i] === '--out') out = argv[++i];
  else if (!profileName) profileName = argv[i];
}
if (!profileName) { console.error('usage: node tools/gate-map.mjs <profileName> [--home <DSH_HOME>] [--out f.html]'); process.exit(2); }
if (!home) home = join(root, 'home');
const profileDir = join(home, 'profiles', profileName);
if (!existsSync(profileDir)) { console.error('profile not found: ' + profileDir); process.exit(2); }
const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const bundles = pj.dsh?.profile?.bundles || [];
let dump = '';
try {
  dump = execFileSync(process.execPath, [DSH_BIN, profileName, '--dump-config'],
    { env: { ...process.env, DSH_HOME: home }, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch { dump = ''; }
let rows = [];
try { rows = yaml.load(dump, { schema }) || []; } catch { rows = []; }
// who wrote each row id, in application order
const layers = [];
for (const name of bundles) {
  const d = join(profileDir, 'node_modules', name);
  const pjF = join(d, 'package.json');
  if (!existsSync(pjF)) continue;
  const j = JSON.parse(readFileSync(pjF, 'utf8'));
  const patch = j.dsh?.bundle?.patch;
  if (!patch) continue;
  const first = Array.isArray(patch) ? patch[0] : patch;
  const pf = join(d, String(first).replace(/^\.\//, ''));
  if (!existsSync(pf)) continue;
  const ids = [...readFileSync(pf, 'utf8').matchAll(/^-\s+id:\s*([\w.@/-]+)/gm)].map(m => m[1]);
  if (ids.length) layers.push({ layer: name, file: pf.replace(/\\\\/g, '/'), ids });
}
const profilePatch = join(profileDir, 'cordis.patch.yml');
if (existsSync(profilePatch)) {
  const ids = [...readFileSync(profilePatch, 'utf8').matchAll(/^-\s+id:\s*([\w.@/-]+)/gm)].map(m => m[1]);
  layers.push({ layer: 'profile patch', file: profilePatch.replace(/\\\\/g, '/'), ids });
}
const lastWriter = new Map();
for (const L of layers) for (const id of L.ids) lastWriter.set(id, L);
const overlapped = [...lastWriter.entries()].filter(([id]) => layers.filter(L => L.ids.includes(id)).length > 1)
  .map(([id, L]) => ({ id, winner: L.layer, file: L.file, by: layers.filter(x => x.ids.includes(id)).map(x => x.layer) }));
// UI surfaces: which plugins inject/override each surface
const surfaces = new Map();
const addS = (ui, who, src) => {
  if (!surfaces.has(ui)) surfaces.set(ui, []);
  surfaces.get(ui).push({ who, src });
};
for (const name of bundles) {
  const d = join(profileDir, 'node_modules', name);
  const pjF = join(d, 'package.json');
  if (!existsSync(pjF)) continue;
  const j = JSON.parse(readFileSync(pjF, 'utf8'));
  const src = (pjF).replace(/\\\\/g, '/');
  for (const inj of (j.dsh?.client?.inject || [])) if (/ui-/.test(inj)) addS(inj.replace('@deepseek-ai/dsh-client-', ''), name, src);
  const patch = j.dsh?.bundle?.patch;
  if (patch) {
    const pf = join(d, String(Array.isArray(patch) ? patch[0] : patch).replace(/^\.\//, ''));
    if (existsSync(pf)) for (const m of readFileSync(pf, 'utf8').matchAll(/^\s*-?\s*id:\s*(ui-[\w-]+)/gm)) addS(m[1], name, pf.replace(/\\\\/g, '/'));
  }
}
const surfaceRows = [...surfaces.entries()].map(([ui, list]) => {
  const byWho = new Map();
  for (const it of list) if (!byWho.has(it.who)) byWho.set(it.who, it.src);
  return { ui, plugins: [...byWho.entries()].map(([who, src]) => ({ who, src })) };
}).sort((a, b) => b.plugins.length - a.plugins.length);
// model routes
const routes = [];
for (const r of rows) {
  const c = r.config || {};
  if (Array.isArray(c.models) && c.models.length) routes.push({ route: r.id, baseURL: c.baseURL || '(default)', models: c.models.map(m => m.id || m).filter(Boolean) });
  if (c.providers && typeof c.providers === 'object') for (const [pid, pv] of Object.entries(c.providers)) routes.push({ route: r.id + ':' + pid, baseURL: (pv && pv.baseURL) || '(builtin)', models: ((pv && pv.models) || []).map(m => m.id || m).filter(Boolean) });
}
// gate timeline
const histPath = join(root, 'state/gate-history.json');
let runs = [], decisions = [];
if (existsSync(histPath)) {
  const h = JSON.parse(readFileSync(histPath, 'utf8'));
  const realDir = (() => { try { return realpathSync.native(profileDir).split(String.fromCharCode(92)).join('/').toLowerCase(); } catch { return profileDir.split(String.fromCharCode(92)).join('/').toLowerCase(); } })();
  runs = (h.runs || []).filter((r) => {
    let n = String(r.profile || '');
    if (!n) return false;
    try { n = realpathSync.native(n); } catch { /* keep */ }
    return n.split(String.fromCharCode(92)).join('/').toLowerCase() === realDir;
  });
  decisions = h.decisions || [];
}
let conflictOut = '';
try {
  conflictOut = execFileSync(process.execPath, [join(root, 'tools/conflict.mjs'), profileDir], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch (e) { conflictOut = String(e.stdout || ''); }
const conflictRows = conflictOut.split(/\r?\n/).filter(l => /^[a-z][a-z-]+\s{2,}/.test(l) || /^\s{2,}\S+\s{2,}/.test(l)).slice(0, 40);
let allRuns = [];
if (existsSync(histPath)) {
  try {
    const h2 = JSON.parse(readFileSync(histPath, 'utf8'));
    allRuns = (h2.runs || []).slice(-40).map(r => ({ at: r.at, result: r.result, profile: String(r.profile || '').split(/[\\/]/).pop(), failed: (r.checks || []).filter(c => !c.ok).map(c => c.name) }));
  } catch { allRuns = []; }
}
const hostVer = runtimeVersion;
const engineSkipped = [];
for (const name of bundles) {
  const pjF = join(profileDir, 'node_modules', name, 'package.json');
  if (!existsSync(pjF)) continue;
  try {
    const j = JSON.parse(readFileSync(pjF, 'utf8'));
    const range = j.engines?.dsh;
    const issue = range ? checkCompatibility({ name, version: j.version, engines: { dsh: range } }) : null;
    if (issue) engineSkipped.push({ name, range, src: pjF.split(String.fromCharCode(92)).join('/') });
  } catch { /* ignore */ }
}
const uiHot = surfaceRows.filter(s => s.plugins.length > 10);
const data = { hostVer, engineSkipped, profile: profileName, profileDir: profileDir.replace(/\\\\/g, '/'), bundles: bundles.length, composed: Buffer.byteLength(dump), rows: rows.length, overlapped, surfaceRows, routes, runs: runs.slice(-20), decisions, uiHot, conflictRows, allRuns };
const htmlPath = out || join(root, 'state', 'gate-map-' + profileName + '.html');
mkdirSync(dirname(htmlPath), { recursive: true });
writeFileSync(htmlPath, render(data), 'utf8');
console.log('wrote ' + htmlPath);
console.log('  overlapped rows ' + overlapped.length + ' | ui surfaces ' + surfaceRows.length + ' | hot(>10) ' + uiHot.length + ' | routes ' + routes.length + ' | runs ' + runs.length);
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function render(d) {
  const pct = d.composed ? (100 * d.composed / 4194304).toFixed(1) : '0';
  const overRows = d.overlapped.map(function (o) {
    return '<tr class="row" data-id="' + esc(o.id) + '" data-detail="' + esc(o.id + ' :: ' + o.file) + '">' +
      '<td class="mono">' + esc(o.id) + '</td>' +
      '<td><span class="chip win">' + esc(o.winner) + '</span></td>' +
      '<td class="muted">' + o.by.map(esc).join(' &rarr; ') + '</td>' +
      '<td class="mono small"><a class="lnk" href="' + esc('vscode://file/' + o.file) + '">' + esc(o.file) + '</a></td></tr>';
  }).join('');
  const surfRows = d.surfaceRows.map(function (s) {
    const n = s.plugins.length;
    const cls = n > 10 ? 'bad' : (n >= 3 ? 'warn' : '');
    const chips = s.plugins.map(function (p) {
      return '<span class="chip" title="' + esc(p.src) + '">' + esc(p.who.split('/').pop()) + '</span>';
    }).join('');
    return '<tr class="row" data-detail="' + esc(s.ui + ' :: ' + (s.plugins[0] ? s.plugins[0].src : '')) + '">' +
      '<td class="mono">' + esc(s.ui) + '</td>' +
      '<td class="' + cls + '">' + n + '</td>' +
      '<td>' + chips + '</td></tr>';
  }).join('');
  const routeRows = d.routes.map(function (r) {
    return '<tr><td class="mono">' + esc(r.route) + '</td><td>' + r.models.length + '</td>' +
      '<td class="mono small muted">' + esc(r.baseURL) + '</td></tr>';
  }).join('');
  const runRows = d.runs.map(function (r) {
    const ok = r.result === 'clear' || r.result === 'quicktest-pass';
    const failed = (r.checks || []).filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join(', ');
    return '<tr><td class="mono small">' + esc(r.at) + '</td>' +
      '<td class="' + (ok ? 'good' : 'bad') + '">' + esc(r.result) + '</td>' +
      '<td class="small muted">' + esc(failed || '—') + '</td></tr>';
  }).join('');
  const css = [
    ':root{--bg:#0e1116;--panel:#161b22;--line:#232a34;--fg:#d7dee8;--muted:#8b96a5;--good:#3fb950;--bad:#f85149;--warn:#d29922;--accent:#58a6ff}',
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 ui-sans-serif,system-ui,sans-serif}',
    'header{padding:22px 28px 12px;border-bottom:1px solid var(--line)}',
    'h1{margin:0 0 6px;font-size:19px}',
    '.meta{color:var(--muted);font-size:12.5px}.meta b{color:var(--fg)}',
    'main{padding:18px 28px 80px;display:grid;gap:22px}',
    'section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}',
    'h2{margin:0 0 4px;font-size:14.5px}',
    '.hint{color:var(--muted);font-size:12px;margin:0 0 12px}',
    'table{width:100%;border-collapse:collapse;font-size:13px}',
    'th{text-align:left;color:var(--muted);font-weight:600;font-size:11.5px;padding:6px 8px;border-bottom:1px solid var(--line)}',
    'td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top}',
    'tr.row{cursor:pointer}tr.row:hover{background:rgba(88,166,255,.08)}',
    '.mono{font-family:ui-monospace,Consolas,monospace}.small{font-size:11.5px}.muted{color:var(--muted)}',
    '.good{color:var(--good)}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}',
    '.chip{display:inline-block;padding:1px 7px;margin:1px 4px 1px 0;border:1px solid var(--line);border-radius:999px;font-size:11.5px;background:#11161d}',
    '.chip.win{border-color:var(--accent);color:var(--accent)}',
    '#detail{position:fixed;right:18px;bottom:18px;max-width:560px;background:#0b0f14;border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:none;box-shadow:0 10px 30px rgba(0,0,0,.5)}',
    '#detail h3{margin:0 0 6px;font-size:13px}#detail pre{margin:4px 0;font-size:11.5px;color:var(--accent);white-space:pre-wrap;word-break:break-all}',
    'a.lnk{color:var(--accent);text-decoration:none}a.lnk:hover{text-decoration:underline}',
    '#detail button{position:absolute;top:6px;right:8px;background:none;border:0;color:var(--muted);cursor:pointer;font-size:15px}'
  ].join('');
  const body = [
    '<header><h1>gate map · ' + esc(d.profile) + '</h1>',
    '<div class="meta">' + esc(d.profileDir) + ' · bundles <b>' + d.bundles + '</b> · 组合 <b>' + d.composed + '</b> B (<b>' + pct + '%</b> of 4 MiB) · 行 <b>' + d.rows + '</b> · 最近闸门 <b>' + esc((d.runs[d.runs.length - 1] || {}).result || '无记录') + '</b></div></header>',
    '<main>',
    '<section><h2>① 拓扑：插件 → UI 面</h2>',
    '<p class="hint">左列是注入 UI 的插件，右列是被注入的 UI 面；连线越密越该收进母按钮。点插件框打开它的 package.json（vscode://）。</p>',
    svgTopology(d),
    '</section>',
    '<section><h2>② 覆盖链：一行被谁最后写</h2>',
    '<p class="hint">同一个 id 出现在多个层时，最终生效者是后写的那层。点行看文件位置。例：<span class="mono">connection</span> 被 dsh-vision-router 用旧的 inject 覆盖，profile patch 又盖回来——这就是“什么时候被盖了”。</p>',
    '<table><thead><tr><th>row id</th><th>最终生效</th><th>写过它的层（按应用顺序）</th><th>文件</th></tr></thead><tbody>' + (overRows || '<tr><td colspan="4" class="muted">没有跨层覆盖</td></tr>') + '</tbody></table></section>',
    '<section><h2>③ UI 抢占面</h2>',
    '<p class="hint">一个界面被越多插件注入，越该收进母按钮。超过 10 个标红（对应闸门第 6 项），3 个以上标黄。</p>',
    '<table><thead><tr><th>UI 面</th><th>插件数</th><th>谁</th></tr></thead><tbody>' + surfRows + '</tbody></table></section>',
    '<section><h2>④ 冲突扫描（ctx 服务 / 版本分叉）</h2>',
    '<p class="hint">来自 tools/conflict.mjs 的实时扫描：known services 只认核心服务名，避免 canvas ctx 之类的误报。</p>',
    '<pre class="mono small">' + esc((d.conflictRows && d.conflictRows.length ? d.conflictRows.join('\n') : 'no conflict patterns found')) + '</pre></section>',
    '<section><h2>⑤ 最近 40 次闸门（全部 profile）</h2>',
    '<p class="hint">红色=被拦下的运行，第三列是拦下它的检查项。<span class="bad">这也解释了“哪里报红”</span>。</p>',
    '<table><thead><tr><th>时间</th><th>profile</th><th>结果</th><th>阻塞项</th></tr></thead><tbody>' + (d.allRuns || []).map(function (r) {
      var ok = r.result === 'clear' || r.result === 'quicktest-pass';
      return '<tr><td class="mono small">' + esc(r.at) + '</td><td class="mono small">' + esc(r.profile) + '</td>' +
        '<td class="' + (ok ? 'good' : 'bad') + '">' + esc(r.result) + '</td>' +
        '<td class="small muted">' + esc((r.failed || []).join(', ') || '—') + '</td></tr>';
    }).join('') + '</tbody></table></section>',
    '<section><h2>⑥ 模型路由</h2>',
    '<p class="hint">同一模型 id 出现在多条路由上时，选择器里就会选错。当前重名数：' + countDup(d) + '</p>',
    '<table><thead><tr><th>路由</th><th>模型数</th><th>baseURL</th></tr></thead><tbody>' + routeRows + '</tbody></table></section>',
    '<section><h2>⑦ 本 profile 的闸门时间线（最近 20 次）</h2>',
    '<p class="hint">来自 state/gate-history.json；红的是被拦下的运行，第三列是拦下它的检查项。</p>',
    '<table><thead><tr><th>时间</th><th>结果</th><th>阻塞项</th></tr></thead><tbody>' + (runRows || '<tr><td colspan="3" class="muted">还没有记录</td></tr>') + '</tbody></table></section>',
    '</main>',
    '<div id="detail"><button id="close">&times;</button><h3>来源</h3><pre id="path"></pre></div>',
    '<script>',
    'var d=document.getElementById("detail"),p=document.getElementById("path");',
    'document.querySelectorAll("[data-detail]").forEach(function(el){el.addEventListener("click",function(){p.textContent=el.getAttribute("data-detail");d.style.display="block";});});',
    'document.getElementById("close").addEventListener("click",function(){d.style.display="none";});',
    '</script>'
  ].join('');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>gate map · ' + esc(d.profile) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
}
function countDup(d) {
  const own = new Map();
  d.routes.forEach(function (r) { r.models.forEach(function (id) { if (!own.has(id)) own.set(id, new Set()); own.get(id).add(r.route); }); });
  let n = 0; own.forEach(function (s) { if (s.size > 1) n++; });
  return n;
}
function svgTopology(d) {
  const W = 1060;
  const pluginMap = new Map();
  for (const s of d.surfaceRows) for (const p of s.plugins) {
    if (!pluginMap.has(p.who)) pluginMap.set(p.who, { who: p.who, src: p.src, uis: [] });
    pluginMap.get(p.who).uis.push(s.ui);
  }
  const plugins = [...pluginMap.values()].sort((a, b) => b.uis.length - a.uis.length).slice(0, 16);
  const used = new Set(plugins.flatMap(p => p.uis));
  const surfaces = d.surfaceRows.filter(s => used.has(s.ui)).slice(0, 12);
  const rowH = 30, top = 34, leftX = 12, rightX = W - 250;
  const H = Math.max(plugins.length, surfaces.length) * rowH + top + 30;
  const py = new Map(), sy = new Map();
  plugins.forEach((p, i) => py.set(p.who, top + i * rowH));
  surfaces.forEach((s, i) => sy.set(s.ui, top + i * rowH));
  const esc2 = (x) => esc(x);
  const edges = [];
  for (const p of plugins) for (const ui of p.uis) {
    if (!sy.has(ui)) continue;
    const y1 = py.get(p.who) + 13, y2 = sy.get(ui) + 13;
    const hot = (d.surfaceRows.find(s => s.ui === ui) || { plugins: [] }).plugins.length > 10;
    edges.push('<path d="M ' + (leftX + 190) + ' ' + y1 + ' C ' + (leftX + 400) + ' ' + y1 + ', ' + (rightX - 120) + ' ' + y2 + ', ' + rightX + ' ' + y2 + '" fill="none" stroke="' + (hot ? '#f85149' : '#30363d') + '" stroke-width="' + (hot ? 1.6 : 1) + '" opacity="' + (hot ? 0.85 : 0.55) + '"/>');
  }
  const pnodes = plugins.map(p => {
    const y = py.get(p.who);
    const href = 'vscode://file/' + p.src;
    return '<a href="' + esc2(href) + '"><g><rect x="' + leftX + '" y="' + y + '" width="190" height="26" rx="6" fill="#11161d" stroke="#30363d"/>' +
      '<text x="' + (leftX + 9) + '" y="' + (y + 17) + '" fill="#d7dee8" font-size="11.5" font-family="ui-monospace,monospace">' + esc2(p.who.length > 24 ? p.who.slice(0, 23) + '…' : p.who) + '</text>' +
      '<text x="' + (leftX + 190 - 8) + '" y="' + (y + 17) + '" fill="#58a6ff" font-size="11" text-anchor="end">' + p.uis.length + '</text></g></a>';
  }).join('');
  const snodes = surfaces.map(s => {
    const y = sy.get(s.ui);
    const n = s.plugins.length;
    const stroke = n > 10 ? '#f85149' : (n >= 3 ? '#d29922' : '#30363d');
    const color = n > 10 ? '#f85149' : (n >= 3 ? '#d29922' : '#8b96a5');
    return '<g><rect x="' + rightX + '" y="' + y + '" width="230" height="26" rx="6" fill="#11161d" stroke="' + stroke + '"/>' +
      '<text x="' + (rightX + 9) + '" y="' + (y + 17) + '" fill="#d7dee8" font-size="11.5" font-family="ui-monospace,monospace">' + esc2(s.ui.replace('@deepseek-ai/dsh-client-', '')) + '</text>' +
      '<text x="' + (rightX + 222) + '" y="' + (y + 17) + '" fill="' + color + '" font-size="11.5" text-anchor="end">' + n + '</text></g>';
  }).join('');
  const skipped = (d.engineSkipped || []).map((k, i) => {
    const y = top + (surfaces.length + 0.6 + i) * rowH;
    return '<a href="' + esc2('vscode://file/' + k.src) + '"><g><rect x="' + rightX + '" y="' + y + '" width="230" height="26" rx="6" fill="#1a0f12" stroke="#f85149"/>' +
      '<text x="' + (rightX + 9) + '" y="' + (y + 17) + '" fill="#f85149" font-size="11.5" font-family="ui-monospace,monospace">跳过: ' + esc2(k.name.slice(0, 22)) + '</text></g></a>';
  }).join('');
  const skipNote = (d.engineSkipped || []).length ? '' : '<text x="' + rightX + '" y="' + (top + (surfaces.length + 0.6) * rowH + 17) + '" fill="#8b96a5" font-size="11.5">引擎闸门：无插件被跳过</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:1080px">' +
    '<text x="' + leftX + '" y="18" fill="#8b96a5" font-size="11.5">插件（点开 package.json）</text>' +
    '<text x="' + rightX + '" y="18" fill="#8b96a5" font-size="11.5">UI 面（数字=注入插件数）</text>' +
    edges.join('') + pnodes + snodes + skipped + skipNote +
    '<text x="' + (W / 2) + '" y="' + (H - 8) + '" fill="#8b96a5" font-size="11" text-anchor="middle">红线 = 该 UI 面被超过 10 个插件注入</text></svg>';
}