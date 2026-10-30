// Host side: GET /turnstile/plugins and POST /turnstile/toggle.
// The browser cannot write files, so every change happens here with a backup.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export const inject = ["webServer"];

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

function toggle(dir, rowId, disable) {
  const patchPath = join(dir, "cordis.patch.yml");
  const text = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
  let next = text;
  if (disable) {
    const block = "- id: " + rowId + "\n  disabled: true";
    const lines0 = text.split(/\r?\n/);
    const at = lines0.findIndex((l) => new RegExp("^-\\s*id:\\s*" + rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$").test(l));
    if (at !== -1) {
      let e = lines0.length;
      for (let i = at + 1; i < lines0.length; i++) { if (/^-\s/.test(lines0[i])) { e = i; break; } }
      next = lines0.slice(0, at).concat(block.split("\n"), lines0.slice(e)).join("\n");
    } else {
      const emptyRe = /^\[\]\s*$/m;
      next = emptyRe.test(text) ? text.replace(emptyRe, block) : text.replace(/\s*$/, "") + "\n" + block + "\n";
    }
  } else {
    const out = [];
    let dropping = false;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^-\s*id:\s*([\w.@/-]+)\s*$/);
      if (m) dropping = m[1] === rowId;
      else if (/^\S/.test(line)) dropping = false;
      if (!dropping) out.push(line);
    }
    next = out.join("\n");
    if (!/^- /m.test(next)) next = next.replace(/\s*$/, "\n") + "[]\n";
  }
  if (!/\n$/.test(next)) next += "\n";
  copyFileSync(patchPath, patchPath + ".bak-" + Date.now());
  writeFileSync(patchPath, next);
}

export function apply(ctx, config) {
  const home = process.env.DSH_HOME || "";
  const profile = (config && config.profile) || "mini";
  const dir = join(home, "profiles", profile);

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/plugins",
    handler: async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
      sendJson(res, 200, { profile, rows: readRows(dir) });
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
      try {
        copyFileSync(patchPath, patchPath + ".bak-" + Date.now());
        writeFileSync(patchPath, next.join("\n"));
        sendJson(res, 200, { ok: true, package: args.package, row: row.row, anchor: args.anchor });
      } catch (e) { sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) }); }
    },
  }), "turnstile: POST /turnstile/anchor");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/turnstile/toggle",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
      let body = "";
      for await (const chunk of req) body += chunk;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "json" }); }
      const row = readRows(dir).find((r) => r.name === args.package);
      if (!row || !row.row) return sendJson(res, 404, { error: "no-row", package: args.package });
      try {
        toggle(dir, row.row, Boolean(args.disable));
        sendJson(res, 200, { ok: true, package: row.name, row: row.row, disabled: Boolean(args.disable) });
      } catch (e) {
        sendJson(res, 500, { error: String((e && e.message) || e).slice(0, 160) });
      }
    }
  }), "turnstile: POST /turnstile/toggle");
}
