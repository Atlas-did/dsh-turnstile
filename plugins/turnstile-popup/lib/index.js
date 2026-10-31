// Host side: GET /turnstile/plugins and POST /turnstile/toggle.
// The browser cannot write files, so every change happens here with a backup.
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { makePlan, applyPlan, describePlan } from "./txn.js";
import { collectConsoleData } from "./console-data.js";
import { readViewState, writeViewState } from "./view-state.js";
import { toggleText } from "./toggle-text.js";
import { DEFAULT_RULES as DEFAULT_HOOK_RULES, validateRules as validateHookRules } from "./hook-rules.js";
import * as health from "./health.js";
import { designerTransaction } from "./designer-ops.js";
import { beginOperation, settleOperation, recoverJournal } from "./journal.js";

const STATE_DIR = () => process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_TURNSTILE_HOME || process.cwd(), "state");

// Reject anything that is not the host's own page: 401 for no credential, 403 for a foreign origin.
// Named after the host capability it mirrors: reject a request that the host would reject.
function requestRejection(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    sendJson(res, 403, { error: "cross-origin" });
    return false;
  }
  const url = String(req.url || "");
  if (url.indexOf("token=") === -1 && !req.headers["x-dsh-token"]) {
    sendJson(res, 401, { error: "unauthenticated" });
    return false;
  }
  return true;
}

// Minimal health check for a patch file: never leave a file that is obviously broken.
function yamlish(file) {
  const text = readFileSync(file, "utf8");
  if (!text.trim()) return { ok: false, detail: "file became empty" };
  const bad = text.split(/\r?\n/).find((l) => l.trim() && !/^(\s*-|\s*[\w.@/-]+:|\s*\[\]|#)/.test(l));
  return bad ? { ok: false, detail: "unexpected line: " + bad.slice(0, 60) } : { ok: true, detail: "structure intact" };
}

// Two-step write: plan first, then apply with the exact confirmation string.
function txnWrite(res, patchPath, nextText, args, reason) {
  const plan = makePlan({ file: patchPath, next: nextText, reason });
  if (!args.confirm) return sendJson(res, 200, { needsConfirm: true, plan: describePlan(plan) });
  beginOperation(STATE_DIR(), { planId: plan.id, file: patchPath, reason, beforeSha: plan.beforeSha, afterSha: plan.afterSha });
  const evidence = applyPlan(plan, { confirm: args.confirm, healthCheck: yamlish });
  if (!evidence.applied) {
    settleOperation(STATE_DIR(), plan.id, evidence.rolledBack ? "rolled-back" : "failed", evidence.problems.join(", "));
    return sendJson(res, 409, { error: "not applied", evidence });
  }
  settleOperation(STATE_DIR(), plan.id, "applied", null);
  return sendJson(res, 200, { ok: true, evidence });
}

export const inject = ["webServer"];

// Devtools-style activity: counts of what the panel asked for, plus a tail of the host log.
const activity = { startedAt: new Date().toISOString(), calls: {}, logPath: process.env.DSH_TURNSTILE_LOG || '' };
const bump = (name) => { activity.calls[name] = (activity.calls[name] || 0) + 1; };

// Standalone console: a full browser page, because a 330px panel cannot hold a table + inspector.
const CONSOLE_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>Turnstile 插件体检</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:13px/1.5 ui-sans-serif,system-ui,"Microsoft YaHei";color:#1f2328;background:#f6f7f9}
.top{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#fff;border-bottom:1px solid #d8dee4}
.top h1{font-size:14px;margin:0 14px 0 0}
.btn{font:inherit;padding:4px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer}
.q{margin-left:auto;display:flex;gap:6px;align-items:center}
.q input{width:260px;padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;font:inherit}
.main{display:grid;grid-template-columns:170px 1fr;height:calc(100vh - 46px)}
nav{background:#fff;border-right:1px solid #d8dee4;padding:6px 0}
nav div{padding:7px 16px;cursor:pointer;font-size:13px}
nav div.on{background:#eff6ff;color:#1f6feb;font-weight:600;border-left:3px solid #1f6feb;padding-left:13px}
section{overflow:auto;padding:14px 18px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{padding:6px 10px;border-bottom:1px solid #eef1f4;text-align:left;white-space:nowrap}
th{position:sticky;top:0;background:#f6f8fa;color:#57606a;font-weight:600;border-bottom:1px solid #d8dee4}
td.n{text-align:right;font-family:ui-monospace,monospace}
tr.on{background:#eff6ff}
.mono{font-family:ui-monospace,monospace}
.grid{display:grid;grid-template-columns:110px 1fr;gap:3px 14px;font-size:12.5px}
.grid .k{color:#57606a}
.delta{color:#57606a;font-size:12px;margin-bottom:10px}
iframe{width:100%;height:calc(100vh - 140px);border:1px solid #d8dee4;border-radius:8px;background:#fff}
pre{font-family:ui-monospace,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-all;margin:0}
</style></head><body>
<div class="top"><h1>插件体检</h1>
<button class="btn" onclick="load(true)">重新体检</button>
<button class="btn" onclick="location.reload()">刷新</button>
<span class="q"><span>筛选</span><input id="q" placeholder="插件 / UI 面 / 状态" oninput="render()"></span></div>
<div class="main"><nav id="nav"></nav><section id="body"></section></div>
<script>
const TOKEN = new URLSearchParams(location.search).get('token') || '';
const PAGES = ['概览','架构图','占用','插件','控制台'];
let page = '概览', D = { rows: [], occ: null, act: null, delta: null }, Q = '';
const api = (p) => fetch('/turnstile/' + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN)).then(r => r.json());
const hit = (t) => !Q || String(t || '').toLowerCase().includes(Q.toLowerCase());
function el(tag, attrs, html) { const e = document.createElement(tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
async function load(update) {
  const [p, o, a] = await Promise.all([api('plugins' + (update === true ? '' : '?update=0')), api('occupancy'), api('activity')]);
  D.rows = p.rows || []; D.delta = p.delta || null; D.occ = o; D.act = a;
  render();
}
function nav() { const n = document.getElementById('nav'); n.innerHTML = ''; PAGES.forEach(p => { const d = el('div', null, p); if (p === page) d.className = 'on'; d.onclick = () => { page = p; render(); }; n.appendChild(d); }); }
function table(cols, rows) {
  let h = '<table><thead><tr>' + cols.map(c => '<th' + (c.n ? ' style="text-align:right"' : '') + '>' + c.t + '</th>').join('') + '</tr></thead><tbody>';
  h += rows.join('');
  return h + '</tbody></table>';
}
function render() {
  nav(); const b = document.getElementById('body');
  const rows = D.rows.filter(r => hit(r.name) || (r.ui || []).some(hit));
  const surf = ((D.occ && D.occ.surfaces) || []).filter(s => hit(s.surface) || (s.plugins || []).some(hit));
  const dl = D.delta && !D.delta.firstRun ? (function () { const p = []; if (D.delta.added.length) p.push('+' + D.delta.added.length + ' 新装'); if (D.delta.removed.length) p.push('-' + D.delta.removed.length + ' 卸载'); if (D.delta.toggled.length) p.push(D.delta.toggled.length + ' 状态变更'); return '自上次查看: ' + (p.length ? p.join(' · ') : '无变化'); })() : (D.delta ? '首次查看，已记下基线' : '');
  if (page === '概览') {
    b.innerHTML = '<div class="delta">' + dl + '</div><div class="grid"><span class="k">插件</span><span>' + D.rows.length + '</span><span class="k">UI 面</span><span>' + ((D.occ && D.occ.surfaces || []).length) + '</span><span class="k">争用</span><span>' + ((D.occ && D.occ.surfaces || []).filter(s => s.contested).length) + '</span><span class="k">停用</span><span>' + D.rows.filter(r => r.disabled).length + '</span></div>';
  } else if (page === '占用') {
    b.innerHTML = '<div class="delta">' + dl + '</div>' + table([{ t: 'UI 面' }, { t: '插件数', n: 1 }, { t: '硬编码', n: 1 }, { t: '插件' }], surf.map(s => '<tr><td class="mono">' + s.surface + '</td><td class="n">' + s.count + '</td><td class="n" style="color:' + ((s.hardcoded || []).length ? '#9a6700' : '#57606a') + '">' + ((s.hardcoded || []).length) + '</td><td style="color:#57606a;font-size:11.5px;max-width:520px;overflow:hidden;text-overflow:ellipsis" title="' + (s.plugins || []).join(', ') + '">' + (s.plugins || []).join(', ') + '</td></tr>'));
  } else if (page === '插件') {
    b.innerHTML = '<div class="delta">' + dl + '</div>' + table([{ t: '插件' }, { t: '状态' }, { t: 'UI 面', n: 1 }, { t: '行 id' }], rows.map(r => { let a = null; ((D.occ && D.occ.surfaces) || []).forEach(s => { if (s.anchors && s.anchors[r.name]) a = s.anchors[r.name]; }); return '<tr' + (r.disabled ? '' : '') + '><td class="mono">' + (r.disabled ? '× ' : '· ') + r.name + '</td><td style="color:' + (r.disabled ? '#cf222e' : (r.engineSkipped ? '#9a6700' : '#1a7f37')) + '">' + (r.disabled ? '停用' : (r.engineSkipped ? '引擎跳过' : '启用')) + '</td><td class="n">' + ((r.ui || []).length) + '</td><td class="mono">' + (a || '硬编码') + '</td></tr>'; }));
  } else if (page === '控制台') {
    b.innerHTML = '<div class="delta">' + (D.act ? '面板请求: ' + Object.keys(D.act.calls || {}).map(k => k + '×' + D.act.calls[k]).join('   ') : '') + '</div><pre>' + ((D.act && D.act.tail || []).join(String.fromCharCode(10)) || (D.act && D.act.note) || '') + '</pre>';
  } else {
    b.innerHTML = '<div class="delta">由 occupancy 数据生成 · <a href="/turnstile/arch?token=' + encodeURIComponent(TOKEN) + '" target="_blank">新窗口打开</a></div><iframe src="/turnstile/arch?token=' + encodeURIComponent(TOKEN) + '"></iframe>';
  }
}
load(false);
</script></body></html>`;

// Delta since the previous look: Process Explorer's colour-by-change, applied to plugin rows.
const seenPath = () => {
  const base = process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_TURNSTILE_HOME || process.cwd(), "state");
  return join(base, "turnstile-seen.json");
};
function computeDelta(rows) {
  const now = {};
  for (const r of rows) now[r.name] = r.disabled ? "off" : (r.engineSkipped ? "skip" : "on");
  let prev = null;
  try { prev = JSON.parse(readFileSync(seenPath(), "utf8")); } catch (e) { prev = null; }
  const delta = { firstRun: !prev, at: prev ? prev.at : null, added: [], removed: [], toggled: [] };
  if (prev && prev.rows) {
    for (const k of Object.keys(now)) {
      if (!(k in prev.rows)) delta.added.push(k);
      else if (prev.rows[k] !== now[k]) delta.toggled.push({ name: k, from: prev.rows[k], to: now[k] });
    }
    for (const k of Object.keys(prev.rows)) if (!(k in now)) delta.removed.push(k);
  }
  try { writeFileSync(seenPath(), JSON.stringify({ at: new Date().toISOString(), rows: now }, null, 2)); } catch (e) { /* read-only state dir */ }
  return delta;
}


const sendJson = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

function blocksOf(patch) {
  const blocks = new Map();
  let cur = null, buf = [];
  const flush = () => { if (cur) blocks.set(cur, buf.join("\n")); };
  for (const line of patch.split(/\r?\n/)) {
    const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
    if (m) { flush(); cur = m[1]; buf = [line]; continue; }
    if (/^\S/.test(line)) { flush(); cur = null; buf = []; continue; }
    if (cur) buf.push(line);
  }
  flush();
  return blocks;
}

function readRows(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const patchPath = join(dir, "cordis.patch.yml");
  const blocks = blocksOf(existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "");
  return bundles.filter((b) => b.indexOf("@deepseek-ai/") !== 0).map((b) => {
    const d = join(dir, "node_modules", b);
    const pj = join(d, "package.json");
    if (!existsSync(pj)) return { name: b, disabled: false, installed: false, row: "" };
    const j = JSON.parse(readFileSync(pj, "utf8"));
    const ids = [];
    const rel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
    if (rel) {
      const pf = join(d, String(rel).replace(/^\.\//, ""));
      if (existsSync(pf)) {
        const t = readFileSync(pf, "utf8");
        const re = /-\s*id:\s*([\w.@/-]+)\s*\n\s*name:\s*['"]([^'"]+)['"]/g;
        let m;
        while ((m = re.exec(t))) if (m[2] === b || m[2].indexOf(b + "/") === 0) ids.push(m[1]);
        if (!ids.length) { const any = /-\s*id:\s*([\w.@/-]+)/g; let m2; while ((m2 = any.exec(t))) ids.push(m2[1]); }
      }
    }
    const off = ids.filter((id) => blocks.has(id) && /^\s*disabled:\s*true\s*$/m.test(blocks.get(id)));
    // which UI surfaces this plugin injects (client.inject) or overrides (its patch rows)
    const ui = [];
    const inj = (j.dsh && j.dsh.client && j.dsh.client.inject) || [];
    for (const s of inj) if (/ui-/.test(s)) ui.push(String(s).replace("@deepseek-ai/dsh-client-", ""));
    if (rel) {
      const pf = join(d, String(rel).replace(/^\.\//, ""));
      if (existsSync(pf)) {
        const t2 = readFileSync(pf, "utf8");
        for (const m of t2.matchAll(/^\s*-?\s*id:\s*(ui-[\w-]+)/gm)) if (ui.indexOf(m[1]) === -1) ui.push(m[1]);
      }
    }
    return { name: b, version: j.version, disabled: off.length > 0, installed: true, row: ids[0] || "", ui };
  });
}

function toggle(text, rowId, disable) {
  // The rules live in lib/toggle-text.js so they can be unit tested.
  return toggleText(text, rowId, disable);
}

function toggleLegacy(text, rowId, disable) {
  let next = text;
  if (disable) {
    const lines0 = text.split(/\r?\n/);
    const at = lines0.findIndex((l) => new RegExp("^-\\s*id:\\s*" + rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$").test(l));
    if (at !== -1) {
      // Keep every existing key of the block (config, name, anchor...) and only add `disabled`.
      let e = lines0.length;
      for (let i = at + 1; i < lines0.length; i++) { if (/^-\s/.test(lines0[i])) { e = i; break; } }
      const bodyLines = lines0.slice(at + 1, e).filter((l) => !/^\s*disabled:\s*true\s*$/.test(l));
      const insertAt = bodyLines.findIndex((l) => /^\s*name:/.test(l));
      const disabledLine = "  disabled: true";
      if (insertAt === -1) bodyLines.unshift(disabledLine); else bodyLines.splice(insertAt + 1, 0, disabledLine);
      next = lines0.slice(0, at + 1).concat(bodyLines, lines0.slice(e)).join("\n");
    } else {
      const block = "- id: " + rowId + "\n  disabled: true";
      const emptyRe = /^\[\]\s*$/m;
      next = emptyRe.test(text) ? text.replace(emptyRe, block) : text.replace(/\s*$/, "") + "\n" + block + "\n";
    }
  } else {
    // Enabling only removes the `disabled: true` line: every other key of the block stays.
    const out = [];
    let inBlock = false;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
      if (m) inBlock = m[1] === rowId;
      else if (/^\S/.test(line)) inBlock = false;
      if (inBlock && /^\s*disabled:\s*true\s*$/.test(line)) continue;
      out.push(line);
    }
    next = out.join("\n");
    if (!/^- /m.test(next)) next = next.replace(/\s*$/, "\n") + "[]\n";
  }
  if (!/\n$/.test(next)) next += "\n";
  return next;
}

export function apply(ctx, config) {
  const home = process.env.DSH_HOME || "";
  const profile = (config && config.profile) || "mini";
  const dir = join(home, "profiles", profile);
  // A leftover lock or temp file means the previous process died mid-write: surface it, do not retry.
  const recovery = recoverJournal(STATE_DIR(), [dir]);
  if (recovery.recoveryRequired || (recovery.leftovers || []).length) {
    ctx.logger && ctx.logger.warn && ctx.logger.warn("turnstile: recovery-required " + JSON.stringify(recovery));
  }

  // ---- view state: what the user left behind (sort column, filter, page) ----
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/view-state",
    handler: async (req, res) => {
      if (req.method === "GET") {
        const r = readViewState(STATE_DIR());
        return sendJson(res, 200, { state: r.state, source: r.source });
      }
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      let body = "";
      for await (const chunk of req) body += chunk;
      let parsed = null;
      try { parsed = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "json" }); }
      try { sendJson(res, 200, { state: writeViewState(STATE_DIR(), parsed) }); }
      catch (e) { sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) }); }
    },
  }), "turnstile: GET/POST /turnstile/view-state");

  // ---- full-window console (from the user's build; same profile, same data) ----
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/console",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const here = dirname(fileURLToPath(import.meta.url));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(join(here, "console.html"), "utf8"));
    },
  }), "turnstile: GET /turnstile/console");

  // Model modules are ESM files the page loads as classic scripts: strip `export`, keep the window
  // attach. One helper for all of them, so a new module is one list entry instead of a copied block.
  const MODULES = ["capabilities.js", "selection.js", "history-timeline.js", "field-schema.js", "hooks.js", "virtual-window.js", "hook-rules.js", "health.js"];
  for (const file of MODULES) {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: "/turnstile/" + file,
      handler: async (req, res) => {
        if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(join(here, file), "utf8").replace(/\bexport\s+(function|const|class)/g, "$1");
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end(src);
      },
    }), "turnstile: GET /turnstile/" + file);
  }

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/diff-state.js",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, "diff-state.js"), "utf8")
        .replace(/\bexport\s+(function|const|class)/g, "$1")
        .replace(/^if \(typeof window[\s\S]*$/m, "");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(src + "\nwindow.TurnstileDiff = { CHANGE: CHANGE, KIND: KIND, SIDE: SIDE, CONFIDENCE: CONFIDENCE, codeOf: codeOf, is: is, isKnown: isKnown, hasChange: hasChange, describe: describe, classifyDiff: classifyDiff };\n");
    },
  }), "turnstile: GET /turnstile/diff-state.js");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/inspector-model.js",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, "inspector-model.js"), "utf8")
        .replace(/\bexport\s+(function|const|class)/g, "$1")
        .replace(/^if \(typeof window[\s\S]*$/m, "");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(src + "\nwindow.TurnstileInspector = { buildInspector: buildInspector };\n");
    },
  }), "turnstile: GET /turnstile/inspector-model.js");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/sort-context.js",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const here = dirname(fileURLToPath(import.meta.url));
      // The module is ESM for the tests; the page loads it as a classic script, so drop the
      // `export` keywords and attach the same API to window.
      const src = readFileSync(join(here, "sort-context.js"), "utf8")
        .replace(/\bexport\s+(function|const|class)/g, "$1")
        .replace(/^if \(typeof window[\s\S]*$/m, "");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(src + "\nwindow.TurnstileSort = { SORT_KEYS: SORT_KEYS, valueOf: valueOf, compareRows: compareRows, orderedRows: orderedRows };\n");
    },
  }), "turnstile: GET /turnstile/sort-context.js");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/console-designer.js",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const here = dirname(fileURLToPath(import.meta.url));
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(join(here, "console-designer.js"), "utf8"));
    },
  }), "turnstile: GET /turnstile/console-designer.js");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/console-data",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      try { sendJson(res, 200, collectConsoleData(dir)); }
      catch (e) { sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/console-data");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/designer",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body || "{}");
        const result = designerTransaction(dir, args.operations, { dryRun: args.dryRun !== false, expected: args.expected }, readRows(dir));
        sendJson(res, 200, result);
      } catch (e) { sendJson(res, e.status || 400, { error: String((e && e.message) || e).slice(0, 180) }); }
    },
  }), "turnstile: POST /turnstile/designer");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/diagnose",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      // Reuse S1/S2 from the repo instead of re-implementing them here (SDS §4/§5).
      const root = process.env.DSH_TURNSTILE_HOME || "";
      const home = process.env.USERPROFILE || "";
      const logsDir = join(home, ".agents-anywhere", "logs");
      const pluginLogs = join(home, ".agents-anywhere", "dsh-bridge-next", "logs");
      try {
        const recordsMod = await import(pathToFileURL(join(root, "tools", "lib", "records.mjs")).href);
        const classifyMod = await import(pathToFileURL(join(root, "tools", "lib", "classify.mjs")).href);
        const paths = [];
        for (const dir of [logsDir, pluginLogs]) {
          if (!existsSync(dir)) continue;
          for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) paths.push(join(dir, f));
        }
        const loaded = recordsMod.readRecords(paths);
        const channels = classifyMod.aggregate(loaded.records, { mode: "all" });
        const verdict = channels.some((c) => c.verdict === "failing") ? "failing" : channels.length ? "healthy" : "undetermined";
        return sendJson(res, 200, { verdict, files: loaded.files.length, records: loaded.records.length, channels, at: new Date().toISOString() });
      } catch (e) {
        return sendJson(res, 200, { verdict: "undetermined", missing: "无法加载诊断模块：" + String(e && e.message), channels: [] });
      }
    },
  }), "turnstile: GET /turnstile/diagnose");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/profiles",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const home = process.env.DSH_HOME || "";
      const root = join(home, "profiles");
      const out = [];
      if (existsSync(root)) {
        for (const name of readdirSync(root)) {
          const dir = join(root, name);
          let bundles = 0;
          try { bundles = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).dsh?.profile?.bundles || []).length; } catch {}
          let rows = 0; let disabled = 0;
          try {
            const patch = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
            rows = (patch.match(/^- id:/gm) || []).length;
            disabled = (patch.match(/disabled:\s*true/g) || []).length;
          } catch {}
          let installed = 0;
          try { installed = readdirSync(join(dir, "node_modules")).length; } catch {}
          out.push({ name, dir, bundles, rows, disabled, installed, current: name === profile });
        }
      }
      sendJson(res, 200, { home, profiles: out, current: profile });
    },
  }), "turnstile: GET /turnstile/profiles");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/health",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const items = [];
      const home = process.env.DSH_HOME || "";
      const credFile = join(home, ".credentials.yaml");
      const credKeys = existsSync(credFile)
        ? readFileSync(credFile, "utf8").split(/\r?\n/).map((l) => (/^([A-Za-z0-9._-]+)\s*:/.exec(l) || [])[1]).filter(Boolean)
        : [];
      items.push(health.credentialsItem({ exists: existsSync(credFile), keys: credKeys }));
      // Two layouts exist in the wild: AA desktop writes ~/.agents-anywhere/dsh-bridge/,
      // while the 2.x DSH plugin writes <DSH_HOME>/agents-anywhere/bridge/.
      const candidates = [
        join(process.env.USERPROFILE || "", ".agents-anywhere", "dsh-bridge", "endpoint.json"),
        join(home, "agents-anywhere", "bridge", "endpoint.json"),
      ];
      const endpoint = candidates.find((p) => existsSync(p)) || candidates[0];
      let endpointMtime = 0;
      try { if (existsSync(endpoint)) endpointMtime = statSync(endpoint).mtimeMs; } catch {}
      items.push(health.bridgeItem({ exists: existsSync(endpoint), mtimeMs: endpointMtime }));
      const prof = { name: profile, dir };
      // Either market package counts: the tutorial names one, a machine may already carry another.
      for (const entry of [["dshmarket", "@ace-zone/dsh-market"], ["dsh-free-search"], ["@agents-anywhere/dsh-bridge-next"]]) {
        const name = entry.find((n) => existsSync(join(prof.dir, "node_modules", n))) || entry[0];
        const installed = existsSync(join(prof.dir, "node_modules", name));
        const patchText = existsSync(join(prof.dir, "cordis.patch.yml")) ? readFileSync(join(prof.dir, "cordis.patch.yml"), "utf8") : "";
        const disabled = new RegExp("id:\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n\\s*disabled:\\s*true").test(patchText);
        items.push(health.pluginItem({ name, installed, disabled }));
      }
      items.push(health.authItem({ total: null }));
      sendJson(res, 200, { items, summary: health.summarize(items), profile: prof.name, at: new Date().toISOString() });
    },
  }), "turnstile: GET /turnstile/health");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/hooks",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      // The profile owns the rules; the host only reads and validates them.
      const file = join(STATE_DIR(), "hooks.json");
      let raw = null;
      try { raw = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null; } catch (e) { raw = null; }
      const source = raw && Array.isArray(raw.rules) ? raw.rules : DEFAULT_HOOK_RULES;
      const checked = validateHookRules(source);
      sendJson(res, 200, { rules: checked.rules, rejected: checked.rejected, source: raw ? "state/hooks.json" : "defaults" });
    },
  }), "turnstile: GET /turnstile/hooks");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/plugins",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      bump("plugins");
      const rowsNow = readRows(dir);
      const peek = String(req.url || "").indexOf("update=0") !== -1;
      sendJson(res, 200, { profile, rows: rowsNow, delta: peek ? null : computeDelta(rowsNow) });
    }
  }), "turnstile: GET /turnstile/plugins");

  // The panel needs the last gate report; read it from state/ (written by preflight).
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/report",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const file = join(process.env.DSH_TURNSTILE_HOME || "C:/Users/finef/Desktop/mini-harness/oss/dsh-turnstile", "state", "report-" + profile + ".json");
      if (!existsSync(file)) return sendJson(res, 404, { error: "no-report", file });
      try {
        sendJson(res, 200, JSON.parse(readFileSync(file, "utf8")));
      } catch (e) {
        sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) });
      }
    },
  }), "turnstile: GET /turnstile/report");

  // Occupancy map: written by `tools/occupancy.mjs --out`, read here so the UI needs no subprocess.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/occupancy",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const file = join(process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_HOME || process.cwd(), "turnstile-state"), "occupancy-" + profile + ".json");
      if (!existsSync(file)) return sendJson(res, 404, { error: "no-occupancy", file });
      try { sendJson(res, 200, JSON.parse(readFileSync(file, "utf8"))); }
      catch (e) { sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/occupancy");

  // Serve the generated architecture diagram so a settings page can embed it.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      bump("console-page");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(CONSOLE_HTML);
    },
  }), "turnstile: GET /turnstile/ (full-page console)");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/arch",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      bump("arch");
      const base = process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_TURNSTILE_HOME || process.cwd(), "state");
      const file = join(base, "arch", "graph.html");
      if (!existsSync(file)) return sendJson(res, 404, { error: "no diagram", hint: "node tools/arch-graph.mjs <profile> --archify <path>", expected: file });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(file));
    },
  }), "turnstile: GET /turnstile/arch");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/activity",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      bump("activity");
      let tail = [];
      let note = "";
      const p = activity.logPath;
      if (!p) note = "未设置 DSH_TURNSTILE_LOG";
      else if (!existsSync(p)) note = "日志不存在: " + p;
      else {
        try {
          const lines = readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).slice(-40);
          tail = lines.filter((l) => /error|fail|warn|activate|fatal|preset/i.test(l)).slice(-12).map((l) => l.slice(0, 160));
          if (!tail.length) note = "最近 40 行没有异常或激活记录";
        } catch (e) { note = String((e && e.message) || e).slice(0, 120); }
      }
      sendJson(res, 200, { startedAt: activity.startedAt, calls: activity.calls, logPath: p, tail, note });
    },
  }), "turnstile: GET /turnstile/activity");

  // Does this plugin accept a position at all, and which values does it document?
  // Drag mode needs this before it can promise anything.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/anchor-support",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const u = new URL(String(req.url), "http://localhost");
      const pkg = u.searchParams.get("package") || "";
      const row = readRows(dir).find((r) => r.name === pkg);
      if (!row) return sendJson(res, 404, { error: "no-package" });
      const base = join(dir, "node_modules", pkg);
      let rowText = "";
      try {
        const j = JSON.parse(readFileSync(join(base, "package.json"), "utf8"));
        const rel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
        if (rel) rowText = readFileSync(join(base, String(rel).replace(/^\.\//, "")), "utf8");
      } catch { /* ignore */ }
      const configurable = /\b(slot|anchor|order)\s*:/.test(rowText);
      const values = new Set();
      for (const rel of ["README.md", "readme.md", "cordis.patch.yml", "package.json"]) {
        try {
          const t = readFileSync(join(base, rel), "utf8");
          const quoted = /anchor\s*[:=]\s*['"]([A-Za-z0-9_.:-]{2,40})['"]/g;
          const bare = /anchor\s*[:=]\s*([A-Za-z][A-Za-z0-9_-]{1,39})\b/g;
          let m;
          while ((m = quoted.exec(t))) values.add(m[1]);
          while ((m = bare.exec(t))) if (m[1].indexOf(".") === -1) values.add(m[1]);
        } catch { /* ignore */ }
      }
      sendJson(res, 200, { package: pkg, configurable, row: row.row || "", values: [...values].sort() });
    },
  }), "turnstile: GET /turnstile/anchor-support");

  // Fusion (mode A): ask the CLI to resolve a contested surface. One implementation, not two.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/fuse",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      let body = "";
      for await (const chunk of req) body += chunk;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "json" }); }
      if (!args.surface) return sendJson(res, 400, { error: "surface" });
      // Applying a fusion writes another plugin's config, so it stays a CLI action with a backup.
      // This endpoint only returns the command: the package spawns no subprocess.
      sendJson(res, 200, {
        ok: false,
        cli: true,
        output: "融合写回需要命令行执行（会改另一个插件的配置并留 .bak）：\n" +
          "node tools/fuse.mjs <profile> --surface " + String(args.surface) + " --apply",
      });
    },
  }), "turnstile: POST /turnstile/fuse");

  // Anchor options the plugin itself declares (docs/patch/readme), so the UI can suggest
  // without inventing a fixed list. An empty list means: type whatever the plugin expects.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/anchor-options",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const u = new URL(String(req.url), "http://localhost");
      const pkg = u.searchParams.get("package") || "";
      const base = join(dir, "node_modules", pkg);
      if (!pkg || !existsSync(base)) return sendJson(res, 404, { error: "no-package" });
      const found = new Set();
      const scan = (rel, quotedOnly) => {
        try {
          const t = readFileSync(join(base, rel), "utf8");
          const quoted = /anchor\s*[:=]\s*['"]([A-Za-z0-9_.:-]{2,40})['"]/g;
          const bare = /anchor\s*[:=]\s*([A-Za-z][A-Za-z0-9_-]{1,39})\b/g;
          let m;
          while ((m = quoted.exec(t))) found.add(m[1]);
          if (!quotedOnly) while ((m = bare.exec(t))) if (m[1].indexOf(".") === -1) found.add(m[1]);
        } catch { /* ignore */ }
      };
      for (const rel of ["README.md", "readme.md", "cordis.patch.yml", "package.json"]) scan(rel, false);
      scan("lib/index.js", true);
      sendJson(res, 200, { package: pkg, suggestions: [...found].sort() });
    },
  }), "turnstile: GET /turnstile/anchor-options");

  // Reposition: same rules as tools/anchor.mjs (dry-run and backup live there; this is the UI path).
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/anchor",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      let body = "";
      for await (const chunk of req) body += chunk;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "json" }); }
      // The value space belongs to the plugin: accept any short token, and allow clearing.
      const clear = args.anchor === "" || args.anchor === null || args.anchor === undefined;
      const ok = clear || (typeof args.anchor === "string" && args.anchor.length <= 40 && /^[A-Za-z0-9_.:-]+$/.test(args.anchor));
      if (!args.package || !ok) return sendJson(res, 400, { error: "args" });
      const row = readRows(dir).find((r) => r.name === args.package);
      if (!row || !row.row) return sendJson(res, 404, { error: "no-row", package: args.package });
      const patchPath = join(dir, "cordis.patch.yml");
      if (!existsSync(patchPath)) return sendJson(res, 404, { error: "no-patch" });
      const lines = readFileSync(patchPath, "utf8").split(/\r?\n/);
      const idx = lines.findIndex((l) => new RegExp("^\\s*-?\\s*id:\\s*" + row.row.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$").test(l));
      if (idx === -1) return sendJson(res, 404, { error: "row-not-in-patch", row: row.row });
      const rowIndent = (lines[idx].match(/^\s*/) || [""])[0].length;
      let end = lines.length;
      for (let i = idx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        const ind = (lines[i].match(/^\s*/) || [""])[0].length;
        if (t && ind <= rowIndent && /^-\s/.test(t)) { end = i; break; }
      }
      const childIndent = " ".repeat(rowIndent + 2);
      const leafIndent = " ".repeat(rowIndent + 4);
      const next = lines.slice();
      const cfg = next.findIndex((l, i) => i > idx && i < end && l.trim() === "config:");
      if (cfg === -1 && !clear) next.splice(idx + 1, 0, childIndent + "config:", leafIndent + "anchor: " + args.anchor);
      else if (cfg !== -1) {
        let a = -1;
        for (let i = cfg + 1; i < end; i++) {
          if (/^\s*anchor:/.test(next[i])) { a = i; break; }
          if (next[i].trim() && (next[i].match(/^\s*/) || [""])[0].length <= rowIndent + 2) break;
        }
        if (clear) { if (a !== -1) next.splice(a, 1); }
        else if (a === -1) next.splice(cfg + 1, 0, leafIndent + "anchor: " + args.anchor);
        else next[a] = leafIndent + "anchor: " + args.anchor;
      }
      return txnWrite(res, patchPath, next.join("\n"), args, "anchor:" + args.package + "=" + (args.anchor || "clear"));
    },
  }), "turnstile: POST /turnstile/anchor");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/toggle",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      let body = "";
      for await (const chunk of req) body += chunk;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "json" }); }
      const row = readRows(dir).find((r) => r.name === args.package);
      if (!row || !row.row) return sendJson(res, 404, { error: "no-row", package: args.package });
      const patchPath = join(dir, "cordis.patch.yml");
      const before = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
      const nextText = toggle(before, row.row, Boolean(args.disable));
      return txnWrite(res, patchPath, nextText, args, "toggle:" + row.name + "=" + (args.disable ? "off" : "on"));
    }
  }), "turnstile: POST /turnstile/toggle");
}
