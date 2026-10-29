// Build the mini popup bundle: one client.js with an embedded read-only snapshot.
// usage: node tools/build-popup.mjs <profileDir> [outDir]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.mjs";

const profile = process.argv[2];
const out = process.argv[3] || join(ROOT, "popup");
if (!profile) { console.error("usage: node tools/build-popup.mjs <profileDir> [outDir]"); process.exit(2); }

const raw = execFileSync(process.execPath, [join(ROOT, "tools/manage.mjs"), profile], { encoding: "utf8" });
const rows = [];
for (const line of raw.split(/\r?\n/)) {
  if (/^(STATUS|bundles|profile|停用|用法)/.test(line)) continue;
  const m = line.match(/^(on|DISABLED|[A-Z-]+(?:\s+[A-Z-]+)*)\s+(\S+)\s+(\S+)?$/);
  if (!m) continue;
  rows.push({ name: m[2], disabled: /DISABLED/.test(m[1]), engineSkipped: /ENGINE-SKIP/.test(m[1]), row: m[3] || "" });
}

const data = { profile, generatedAt: new Date().toISOString(), rows };
mkdirSync(join(out, "lib"), { recursive: true });

writeFileSync(join(out, "package.json"), JSON.stringify({
  name: "turnstile-popup", version: "0.0.1", private: true, type: "module",
  main: "./lib/index.js",
  exports: { ".": "./lib/index.js", "./client": "./lib/client.js", "./cordis.patch.yml": "./cordis.patch.yml" },
  dsh: { bundle: { patch: "./cordis.patch.yml" }, client: { platform: "web", inject: ["@deepseek-ai/dsh-client-ui-slots"] } },
}, null, 2));

writeFileSync(join(out, "cordis.patch.yml"), "- insert:\n    - id: turnstile-popup\n      name: turnstile-popup\n");
writeFileSync(join(out, "lib/index.js"), "export function apply() {}\n");

const client = [
  "window.__ModuleLoader__.load({",
  "  id: \"turnstile-popup\",",
  "  factory: (require) => ({",
  "    apply(ctx) {",
  "      const React = require(\"react\");",
  "      const h = React.createElement;",
  "      const DATA = " + JSON.stringify(data) + ";",
  "      function Card() {",
  "        const [open, setOpen] = React.useState(true);",
  "        if (!open) return h(\"button\", { onClick: () => setOpen(true), style: { position: \"fixed\", right: \"18px\", bottom: \"18px\", zIndex: 9999, padding: \"6px 10px\", borderRadius: \"8px\", border: \"1px solid #30363d\", background: \"#161b22\", color: \"#d7dee8\", cursor: \"pointer\", fontSize: \"12px\" } }, \"插件 \" + DATA.rows.length);",
  "        const off = DATA.rows.filter((r) => r.disabled).length;",
  "        const skipped = DATA.rows.filter((r) => r.engineSkipped).length;",
  "        return h(\"div\", { style: { position: \"fixed\", right: \"18px\", bottom: \"18px\", zIndex: 9999, width: \"360px\", maxHeight: \"52vh\", overflow: \"auto\", background: \"#0e1116\", color: \"#d7dee8\", border: \"1px solid #30363d\", borderRadius: \"10px\", padding: \"12px 14px\", boxShadow: \"0 10px 30px rgba(0,0,0,.5)\", fontFamily: \"ui-sans-serif,system-ui\" } },",
  "          h(\"div\", { style: { display: \"flex\", justifyContent: \"space-between\", alignItems: \"center\", marginBottom: \"8px\" } },",
  "            h(\"strong\", { style: { fontSize: \"13px\" } }, \"mini · 插件 \" + DATA.rows.length),",
  "            h(\"button\", { onClick: () => setOpen(false), style: { background: \"none\", border: 0, color: \"#8b96a5\", cursor: \"pointer\", fontSize: \"15px\" } }, \"×\")),",
  "          h(\"div\", { style: { color: \"#8b96a5\", fontSize: \"11.5px\", marginBottom: \"8px\" } }, \"停用 \" + off + \" · 引擎跳过 \" + skipped + \" · 只读快照\"),",
  "          ...DATA.rows.map((r) => h(\"div\", { key: r.name, style: { display: \"flex\", gap: \"8px\", padding: \"3px 0\", fontSize: \"12.5px\" } },",
  "            h(\"span\", { style: { width: \"14px\", color: r.disabled ? \"#f85149\" : \"#3fb950\" } }, r.disabled ? \"×\" : \"·\"),",
  "            h(\"span\", { style: { flex: 1, fontFamily: \"ui-monospace,monospace\" } }, r.name),",
  "            r.engineSkipped ? h(\"span\", { style: { color: \"#d29922\", fontSize: \"11px\" } }, \"skip\") : null)));",
  "      }",
  "      ctx.slots.inject(\"shell.overlay\", () => ctx.slots.register({ name: \"shell.overlay\", id: \"turnstile.plugin-list\" }, Card));",
  "    },",
  "  }),",
  "});",
].join("\n");
writeFileSync(join(out, "lib/client.js"), client + "\n");
console.log("built popup at " + out + "  rows=" + rows.length);
