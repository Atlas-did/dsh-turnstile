// Host side: GET /turnstile/plugins and POST /turnstile/toggle.
// The browser cannot write files, so every change happens here with a backup.
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { makePlan, applyPlan, describePlan } from "./txn.js";
import { validatePageTree } from "./page-validate.js";
import { readPage, writePage } from "./page-store.js";
import { collectConsoleData } from "./console-data.js";
import { readViewState, writeViewState } from "./view-state.js";
import { toggleText } from "./toggle-text.js";
import { DEFAULT_RULES as DEFAULT_HOOK_RULES, validateRules as validateHookRules } from "./hook-rules.js";
import * as health from "./health.js";
import { exportPlugin } from "./plugin-export.js";
import { verifyExportedPlugin } from "./export-verify.js";
import { designerTransaction } from "./designer-ops.js";
import { beginOperation, settleOperation, recoverJournal, listOperations } from "./journal.js";
import { randomUUID } from "node:crypto";

const STATE_DIR = () => process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_TURNSTILE_HOME || process.cwd(), "state");
// B17: every endpoint must read the same state base, or two of them disagree about the same data.
// Order: explicit override, the toolkit's own state dir, then the DSH home convention.
const stateBase = () => process.env.DSH_TURNSTILE_STATE
  || (process.env.DSH_TURNSTILE_HOME ? join(process.env.DSH_TURNSTILE_HOME, "state") : "")
  || join(process.env.DSH_HOME || join(process.env.USERPROFILE || "", ".dsh"), "turnstile-state");

// Reject anything that is not the host's own page: 401 for no credential, 403 for a foreign origin.
// Named after the host capability it mirrors: reject a request that the host would reject.
function requestRejection(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    sendJson(res, 403, { error: "cross-origin" });
    return false;
  }
  const url = String(req.url || "");
  if (url.indexOf("token=") === -1 && !req.headers["x-dsh-token"] && !req.headers["x-turnstile-token"]) {
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

// B4: the panel runs inside the host's authenticated page, so a blanket token requirement would
// break it. What can be enforced without pretending: foreign origins are rejected on every route,
// and state-changing requests still need the token. Read-only routes are same-origin only.
// slot-map 是「页面自己报上来的 slot 快照」：只含 slot 名与条目数，不含用户内容。
// 它必须免 token —— DSH 加载后会抹掉 URL 里的 ?token=，插件侧拿不到令牌（实测 401）。
// 跨源仍由 guardHandler 挡住，所以只允许同源页面/本机工具写入。
// 两档豁免，别再混成一个：
//   AUTH_EXEMPT  —— 完全绕过 guard（只给静态页 /turnstile/，它不写任何东西）
//   TOKEN_EXEMPT —— 只免 token，仍然做跨源检查（slot-map 是页面自己报的快照）
const AUTH_EXEMPT = new Set(["/turnstile/"]);
const TOKEN_EXEMPT = new Set(["/turnstile/slot-map"]);
function guardHandler(handler, path) {
  if (!path || !path.startsWith("/turnstile/")) return handler;
  if (AUTH_EXEMPT.has(path)) return handler;
  const skipToken = TOKEN_EXEMPT.has(path);
  return async (req, res) => {
    const origin = String(req.headers.origin || "");
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return sendJson(res, 403, { error: "cross-origin" });
    const writes = req.method !== "GET" && req.method !== "HEAD";
    if (writes && !skipToken && !requestRejection(req, res)) return;
    return handler(req, res);
  };
}


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
const authHeaders = TOKEN ? { 'x-turnstile-token': TOKEN } : {};
const api = (p) => fetch('/turnstile/' + p + (TOKEN ? (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN) : ''), { headers: authHeaders }).then(r => r.json());
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
  // B4: wrap register once so no route can forget the gate.
  const rawRegister = ctx.webServer.register.bind(ctx.webServer);
  ctx.webServer.register = (options) => rawRegister({ ...options, handler: guardHandler(options.handler, options.path) });

  // B5: the host does not promise DSH_HOME; cwd is never a DSH home, the user profile is.
  const home = process.env.DSH_HOME || join(process.env.USERPROFILE || "", ".dsh");
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
    path: "/turnstile/audit",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      sendJson(res, 200, { entries: listOperations(STATE_DIR()) });
    },
  }), "turnstile: GET /turnstile/audit");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/designer",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      const planId = randomUUID();
      let dryRun = true;
      let started = false;
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body || "{}");
        dryRun = args.dryRun !== false;
        const summary = Array.isArray(args.operations) ? args.operations.slice(0, 100).map((op) => ({ type: String(op?.type || ""), package: String(op?.package || ""), disable: typeof op?.disable === "boolean" ? op.disable : undefined, anchor: typeof op?.anchor === "string" ? op.anchor : undefined })) : [];
        beginOperation(STATE_DIR(), { planId, kind: "designer", dryRun, target: "cordis.patch.yml", workspace: String(args.workspace || "default").slice(0, 80), operationCount: summary.length, operations: summary });
        started = true;
        const result = designerTransaction(dir, args.operations, { dryRun, expected: args.expected }, readRows(dir));
        settleOperation(STATE_DIR(), planId, dryRun ? "previewed" : "applied", { changed: result.changed });
        sendJson(res, 200, Object.assign({}, result, { auditId: planId }));
      } catch (e) {
        if (started) { try { settleOperation(STATE_DIR(), planId, "failed", String((e && e.message) || e).slice(0, 180)); } catch {} }
        sendJson(res, e.status || 400, { error: String((e && e.message) || e).slice(0, 180), details: e.details || [], auditId: started ? planId : undefined });
      }
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
        const actionsMod = await import(pathToFileURL(join(root, "tools", "lib", "actions.mjs")).href);
        const loaded = recordsMod.readRecords(paths);
        const channels = classifyMod.aggregate(loaded.records, { mode: "all" });
        const verdict = channels.some((c) => c.verdict === "failing") ? "failing"
          : channels.some((c) => c.verdict === "undetermined") ? "undetermined"
          : channels.length ? "healthy" : "undetermined";
        return sendJson(res, 200, {
          verdict, files: loaded.files.length, records: loaded.records.length, channels,
          actions: actionsMod.actionsFor(channels), missing: actionsMod.missingFor(channels),
          at: new Date().toISOString(),
        });
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
      const home = process.env.DSH_HOME || join(process.env.USERPROFILE || "", ".dsh");
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
      // 「最近一次可用」来自 DSH 自己的 verified-bootable 快照；没有就如实说没有。
      let lastKnownGood = null;
      try {
        const snaps = join(home, "profile-snapshots");
        if (existsSync(snaps)) {
          const names = readdirSync(snaps).filter((n) => n.indexOf("verified-bootable") === 0).sort();
          const newest = names[names.length - 1];
          if (newest) {
            const at = statSync(join(snaps, newest)).mtimeMs;
            lastKnownGood = { name: newest, at: new Date(at).toISOString(), ageDays: Math.floor((Date.now() - at) / 86400000) };
          }
        }
      } catch {}
      sendJson(res, 200, { home, profiles: out, current: profile, lastKnownGood });
    },
  }), "turnstile: GET /turnstile/profiles");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/health",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const items = [];
      const home = process.env.DSH_HOME || join(process.env.USERPROFILE || "", ".dsh");
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
      // B15: only talk about the bridge when this profile actually has a bridge plugin; a clean
      // profile has no reason to hear about someone else's endpoint file.
      const bridgeInstalled = existsSync(join(dir, "node_modules", "@agents-anywhere", "dsh-bridge-next"));
      if (bridgeInstalled || existsSync(endpoint)) {
        items.push(health.bridgeItem({ exists: existsSync(endpoint), mtimeMs: endpointMtime }));
      }
      const prof = { name: profile, dir };
      // B15: report what this profile actually declares, not a list of the author's plugins.
      let bundles = [];
      try { bundles = (JSON.parse(readFileSync(join(prof.dir, "package.json"), "utf8")).dsh || {}).profile?.bundles || []; } catch {}
      const patchText = existsSync(join(prof.dir, "cordis.patch.yml")) ? readFileSync(join(prof.dir, "cordis.patch.yml"), "utf8") : "";
      // B16: a bundle the host ships (asar) is not missing just because the profile lacks it.
      const hostProvided = [];
      const missingBundles = [];
      for (const n of bundles) {
        if (existsSync(join(prof.dir, "node_modules", n))) continue;
        let hostHas = false;
        // Resolve from the running host entry: the host ships bundles under runtime/node_modules,
        // which is not on the profile's resolution chain.
        for (const base of [process.argv[1], import.meta.url]) {
          if (hostHas || !base) continue;
          try { createRequire(base).resolve(n); hostHas = true; } catch {}
        }
        if (hostHas) hostProvided.push(n); else missingBundles.push(n);
      }
      const disabledCount = (patchText.match(/disabled:\s*true/g) || []).length;
      items.push(health.bundlesItem({ total: bundles.length, hostProvided, missing: missingBundles }));
      items.push(health.authItem({ total: null }));
      // 三个坑的检查（双市场 / git 依赖 / client bundle）与 diagnose 同一份实现。
      let pits = [];
      const repoRoot = process.env.DSH_TURNSTILE_HOME || "";
      try {
        const pitsMod = await import(pathToFileURL(join(repoRoot, "tools", "pits.mjs")).href);
        pits = pitsMod.runPitChecks(prof.dir);
      } catch (e) { pits = [{ id: "pit:unavailable", level: "skip", message: "无法加载 pits 模块：" + String(e && e.message), next: "" }]; }
      sendJson(res, 200, { items, pits, summary: health.summarize(items), profile: prof.name, at: new Date().toISOString() });
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
      // B17: one state base for every endpoint, and a missing report is data, not a 404.
      const file = join(stateBase(), "report-" + profile + ".json");
      if (!existsSync(file)) return sendJson(res, 200, { status: "not-generated", file, hint: "node tools/preflight.mjs <profile>" });
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
      const file = join(stateBase(), "occupancy-" + profile + ".json");
      if (!existsSync(file)) return sendJson(res, 200, { status: "not-generated", file, hint: "node tools/occupancy.mjs <profile> --out" });
      try { sendJson(res, 200, JSON.parse(readFileSync(file, "utf8"))); }
      catch (e) { sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/occupancy");

  // 页面搭建器：/turnstile/builder 是画布 UI，page-model.js 是它的数据层，page JSON 存在 state 里。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/builder",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      try {
        const file = join(dirname(fileURLToPath(import.meta.url)), "builder.html");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(readFileSync(file, "utf8"));
      } catch (e) { sendJson(res, 500, { error: "builder.html 读不出：" + String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/builder");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/page-model.js",
    handler: async (req, res) => {
      try {
        const file = join(dirname(fileURLToPath(import.meta.url)), "page-model.js");
        // 浏览器按经典脚本加载（没有 import/export），所以这里剥掉 export 关键字；
        // 文件本身仍是 ESM，node 侧测试可以直接 import（同其它 lib 模块的处理方式）。
        const src = readFileSync(file, "utf8").replace(/^export\s+(?=(function|const|let|class))/gm, "");
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end(src);
      } catch (e) { sendJson(res, 500, { error: "page-model.js 读不出：" + String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/page-model.js");

  // 设计令牌：控制台与搭建器共用一份（窄屏抽屉规则也在里面）
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/tokens.css",
    handler: async (req, res) => {
      try {
        const file = join(dirname(fileURLToPath(import.meta.url)), "tokens.css");
        res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
        res.end(readFileSync(file, "utf8"));
      } catch (e) { sendJson(res, 500, { error: "tokens.css 读不出：" + String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/tokens.css");

  // 统一入口：面板按钮全部打这一条（02 设计 §4）。写操作有 dryRun + applyToken 兜底。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/run",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      let body = "";
      await new Promise((resolve) => { req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); }); req.on("end", resolve); });
      let parsed; try { parsed = JSON.parse(body); } catch { return sendJson(res, 400, { error: "body 不是 JSON" }); }
      if (parsed && parsed.args && !parsed.args.profile) parsed.args.profile = dir;
      try {
        const libDir = dirname(fileURLToPath(import.meta.url));
        const mod = await import(pathToFileURL(join(libDir, "run-route.js")).href);
        const out = await mod.handleRun(parsed, { toolsRoot: process.env.DSH_TURNSTILE_HOME ? join(process.env.DSH_TURNSTILE_HOME, 'tools') : undefined });
        return sendJson(res, out.status, out.body);
      } catch (e) { return sendJson(res, 500, { ok: false, verdict: "unknown", summary: String(e.message).slice(0, 200) }); }
    },
  }), "turnstile: POST /turnstile/run");
  // 运行时 slot 快照：客户端（在 DSH 页面里）观测到的注入记录，POST 到这里存盘，供 ui-atlas 使用。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/slot-map",
    handler: async (req, res) => {
      if (req.method === "GET") {
        const f = join(stateBase(), "slot-map-" + profile + ".json");
        if (!existsSync(f)) return sendJson(res, 200, { status: "not-generated", file: f });
        try { return sendJson(res, 200, JSON.parse(readFileSync(f, "utf8"))); } catch (e) { return sendJson(res, 500, { error: String(e.message).slice(0, 120) }); }
      }
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      let body = "";
      await new Promise((resolve) => { req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); }); req.on("end", resolve); });
      let parsed; try { parsed = JSON.parse(body); } catch { return sendJson(res, 400, { error: "body 不是 JSON" }); }
      if (!parsed || !Array.isArray(parsed.slots)) return sendJson(res, 400, { error: "缺少 slots 数组" });
      try {
        const f = join(stateBase(), "slot-map-" + profile + ".json");
        mkdirSync(dirname(f), { recursive: true });
        writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), profile, slots: parsed.slots }, null, 0));
        return sendJson(res, 200, { ok: true, file: f, slots: parsed.slots.length });
      } catch (e) { return sendJson(res, 500, { error: String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET/POST /turnstile/slot-map");
  // 插件骨架：控制台点一行就调这里（与 CLI 共用 lib/plugin-inspect.js）。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/inspect",
    handler: async (req, res) => {
      const m = /[?&]pkg=([^&]*)/.exec(String(req.url || ""));
      if (!m) return sendJson(res, 400, { error: "缺少 pkg" });
      const pkgName = decodeURIComponent(m[1]);
      try {
        const libDir = dirname(fileURLToPath(import.meta.url));
        const mod = await import(pathToFileURL(join(libDir, "plugin-inspect.js")).href);
        const r = mod.inspectPlugin(dir, pkgName, { lines: 12 });
        // 3=没装（200，前端好展示）；2=参数非法（400）；其他=500
        const status = r.ok ? 200 : r.code === 3 ? 200 : r.code === 2 ? 400 : 500;
        return sendJson(res, status, r.data || { error: r.reason });
      } catch (e) { return sendJson(res, 500, { error: String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/inspect");
  // 启动器：搜索 state/launcher-index.json（由 tools/launcher.mjs index 生成）。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/search",
    handler: async (req, res) => {
      const qm = /[?&]q=([^&]*)/.exec(String(req.url || ""));
      const query = qm ? decodeURIComponent(qm[1]) : "";
      const file = join(stateBase(), "launcher-index.json");
      if (!existsSync(file)) return sendJson(res, 200, { query, hits: [], status: "no-index", hint: "node tools/launcher.mjs index --root <dir>" });
      try {
        const libDir = dirname(fileURLToPath(import.meta.url));
        const mod = await import(pathToFileURL(join(libDir, "launcher-index.js")).href);
        const idx = JSON.parse(readFileSync(file, "utf8"));
        const hits = mod.searchIndex(idx.entries, query, { limit: 30 });
        return sendJson(res, 200, { query, count: hits.length, total: idx.count, builtAt: idx.builtAt, hits });
      } catch (e) { return sendJson(res, 500, { error: String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/search");
  // 本地图片：搭建器要能引用仓库里的图（docs/img、state）或 DSH_TURNSTILE_ASSETS 指定的目录。
  // 只允许白名单根目录，并且解析后必须仍在其中（防 ../ 穿越）。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/asset",
    handler: async (req, res) => {
      const q = String(req.url || "");
      const m = /[?&]path=([^&]*)/.exec(q);
      if (!m) return sendJson(res, 400, { error: "缺少 path" });
      const wanted = decodeURIComponent(m[1]);
      const repo = process.env.DSH_TURNSTILE_HOME || "";
      const roots = [
        join(repo, "docs", "img"),
        join(repo, "state"),
        process.env.DSH_TURNSTILE_ASSETS || "",
      ].filter(Boolean).map((p) => resolve(p));
      const target = resolve(wanted);
      const ok = roots.some((r) => target === r || target.startsWith(r + sep));
      if (!ok) return sendJson(res, 403, { error: "不在允许的图片目录里", tried: target, roots });
      if (!existsSync(target)) return sendJson(res, 404, { error: "文件不存在", target });
      const ext = (target.split(".").pop() || "").toLowerCase();
      const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
      if (!types[ext]) return sendJson(res, 415, { error: "不是图片：" + ext });
      res.writeHead(200, { "content-type": types[ext], "cache-control": "no-store" });
      res.end(readFileSync(target));
    },
  }), "turnstile: GET /turnstile/asset");
  // 宿主内页面：/turnstile/view 只读渲染 state 里的页面 JSON（搭建器负责编辑）。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/view",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      const html = [
        "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>页面</title>",
        "<style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#0d141c;color:#dce3ea;font:13px/1.5 ui-sans-serif,system-ui,'Microsoft YaHei'}",
        ".empty{color:#8fa3b5}</style></head><body><div id=\"root\"></div>",
        "<script src=\"/turnstile/page-render.js\"></script>",
        "<script>var t=new URLSearchParams(location.search).get('token')||'';",
        "fetch('/turnstile/page'+'?token='+encodeURIComponent(t)).then(function(r){return r.json()}).then(function(j){",
        "  var root=document.getElementById('root');",
        "  if(!j||!j.root){root.innerHTML='<p class=empty>还没有页面：先到 /turnstile/builder 搭一个并保存。</p>';return;}",
        "  root.append(window.TurnstilePageRender.render(j.root));",
        "}).catch(function(e){document.getElementById('root').innerHTML='<p class=empty>读取失败：'+e.message+'</p>';});</script></body></html>",
      ].join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
    },
  }), "turnstile: GET /turnstile/view");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/page-render.js",
    handler: async (req, res) => {
      try {
        const file = join(dirname(fileURLToPath(import.meta.url)), "page-render.js");
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end(readFileSync(file, "utf8"));
      } catch (e) { sendJson(res, 500, { error: "page-render.js 读不出：" + String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET /turnstile/page-render.js");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/page",
    handler: async (req, res) => {
      const file = join(stateBase(), "page-" + profile + ".json");
      if (req.method === "GET") {
        const got = readPage(file);
        if (!got.exists) return sendJson(res, 200, { status: "not-generated", file, version: 0 });
        if (!got.page) return sendJson(res, 500, { error: "读不出页面文件：" + (got.error || "") });
        return sendJson(res, 200, Object.assign(got.page, { version: got.version }));
      }
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      // 写前先校验：没有 schema 标记或根节点不是对象，一律拒绝（B8 的纪律）。
      let body = "";
      await new Promise((resolve) => { req.on("data", (c) => { body += c; if (body.length > 2e6) req.destroy(); }); req.on("end", resolve); });
      let parsed;
      try { parsed = JSON.parse(body); } catch { return sendJson(res, 400, { error: "body 不是 JSON" }); }
      // 严格校验页面树（与 console-server 同一份实现）
      const tree = validatePageTree(parsed.page);
      if (!tree.ok) return sendJson(res, 400, { error: "页面不合法：" + tree.errors[0], errors: tree.errors });
      if (!parsed || !parsed.page || typeof parsed.page !== "object" || !parsed.page.schema || !parsed.page.root) {
        return sendJson(res, 400, { error: "页面缺少 schema 或 root" });
      }
      try {
        // 与独立控制台共用同一份版本比较 + 备份 + 原子写（审查 P1-1）
        const wrote = writePage(file, parsed.page, { baseVersion: parsed.baseVersion });
        if (!wrote.ok) return sendJson(res, 409, { error: "页面已被其他地方修改（当前版本 " + wrote.version + "）", version: wrote.version, stale: true });
        return sendJson(res, 200, { ok: true, file, version: wrote.version });
      } catch (e) { return sendJson(res, 500, { error: String(e.message).slice(0, 160) }); }
    },
  }), "turnstile: GET/POST /turnstile/page");

  // 导出只写本插件的 state/exports；浏览器只能给插件名和页面，不能指定任意输出路径。
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/export",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      if (!requestRejection(req, res)) return;
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 2e6) return sendJson(res, 413, { error: "页面过大" });
        }
        const parsed = JSON.parse(body || "{}");
        const renderer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "page-render.js"), "utf8");
        const result = exportPlugin(parsed.page, join(stateBase(), "exports", String(parsed.name || "")), { name: parsed.name, renderer });
        const verification = await verifyExportedPlugin(result.outDir);
        return sendJson(res, 200, { ok: verification.ok, ...result, verification });
      } catch (e) {
        return sendJson(res, 400, { error: String((e && e.message) || e).slice(0, 180) });
      }
    },
  }), "turnstile: POST /turnstile/export");
  // B11: there used to be two shells (/turnstile/ = a 6 KB light summary, /turnstile/console = the
  // real 44 KB console). Two shells showing the same data differently is how "same data, two verdicts"
  // happens; keep one, and redirect the old address so existing links still work.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      bump("console-redirect");
      const q = String(req.url || "").includes("token=") ? String(req.url).slice(String(req.url).indexOf("?")) : "";
      res.writeHead(302, { location: "/turnstile/console" + q, "cache-control": "no-store" });
      res.end();
    },
  }), "turnstile: GET /turnstile/ (redirects to /turnstile/console)");

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
