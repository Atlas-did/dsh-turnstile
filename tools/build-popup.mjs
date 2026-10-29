// Build the mini popup bundle: one client.js with an embedded read-only snapshot.
// The client module face copies the shape used by @deepseek-ai client bundles:
//   factory(require) -> { exports.apply, exports.inject }   (service names, e.g. "slots")
// usage: node tools/build-popup.mjs <profileDir> [outDir]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.mjs";

const profile = process.argv[2];
const out = process.argv[3] || join(ROOT, "popup");
if (!profile) { console.error("usage: node tools/build-popup.mjs <profileDir> [outDir]"); process.exit(2); }

// ask manage for structured data instead of parsing its aligned table
const raw = execFileSync(process.execPath, [join(ROOT, "tools/manage.mjs"), profile, "--json"], { encoding: "utf8" });
const parsed = JSON.parse(raw);
const rows = parsed.rows.map((r) => ({ name: r.name, disabled: r.disabled, engineSkipped: r.engineSkipped }));

const data = { profile, generatedAt: new Date().toISOString(), rows };
mkdirSync(join(out, "lib"), { recursive: true });

writeFileSync(join(out, "package.json"), JSON.stringify({
  name: "turnstile-popup", version: "0.0.2", private: true, type: "module",
  main: "./lib/index.js",
  exports: { ".": "./lib/index.js", "./client": "./lib/client.js", "./cordis.patch.yml": "./cordis.patch.yml" },
  dsh: { bundle: { patch: "./cordis.patch.yml" }, client: { platform: "web", inject: ["@deepseek-ai/dsh-client-ui-slots"] } },
}, null, 2));
writeFileSync(join(out, "cordis.patch.yml"), "- insert:\n    - id: turnstile-popup\n      name: turnstile-popup\n");
writeFileSync(join(out, "lib/index.js"), "export function apply() {}\n");

const client = [
  "window.__ModuleLoader__.load({",
  "  id: \"turnstile-popup\",",
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
  "    exports.inject = [\"slots\"];",
  "    exports.apply = function apply(ctx) {",
  "      var React = require(\"react\");",
  "      var h = React.createElement;",
  "      var DATA = " + JSON.stringify(data) + ";",
  "      function Card() {",
  "        var s = React.useState(true);",
  "        var open = s[0], setOpen = s[1];",
  "        if (!open) return h(\"button\", { onClick: function () { setOpen(true); }, style: { position: \"fixed\", right: \"18px\", bottom: \"18px\", zIndex: 9999, padding: \"6px 10px\", borderRadius: \"8px\", border: \"1px solid #30363d\", background: \"#161b22\", color: \"#d7dee8\", cursor: \"pointer\", fontSize: \"12px\" } }, \"插件 \" + DATA.rows.length);",
  "        var off = DATA.rows.filter(function (r) { return r.disabled; }).length;",
  "        var skipped = DATA.rows.filter(function (r) { return r.engineSkipped; }).length;",
  "        return h(\"div\", { style: { position: \"fixed\", right: \"18px\", bottom: \"18px\", zIndex: 9999, width: \"340px\", maxHeight: \"50vh\", overflow: \"auto\", background: \"#0e1116\", color: \"#d7dee8\", border: \"1px solid #30363d\", borderRadius: \"10px\", padding: \"12px 14px\", fontFamily: \"ui-sans-serif,system-ui\" } },",
  "          h(\"div\", { style: { display: \"flex\", justifyContent: \"space-between\", marginBottom: \"6px\" } },",
  "            h(\"strong\", { style: { fontSize: \"13px\" } }, \"mini · 插件 \" + DATA.rows.length),",
  "            h(\"button\", { onClick: function () { setOpen(false); }, style: { background: \"none\", border: 0, color: \"#8b96a5\", cursor: \"pointer\" } }, \"×\")),",
  "          h(\"div\", { style: { color: \"#8b96a5\", fontSize: \"11.5px\", marginBottom: \"8px\" } }, \"停用 \" + off + \" · 引擎跳过 \" + skipped + \" · 只读\"),",
  "          DATA.rows.map(function (r) { return h(\"div\", { key: r.name, style: { display: \"flex\", gap: \"8px\", fontSize: \"12.5px\", padding: \"2px 0\" } },",
  "            h(\"span\", { style: { width: \"12px\", color: r.disabled ? \"#f85149\" : \"#3fb950\" } }, r.disabled ? \"×\" : \"·\"),",
  "            h(\"span\", { style: { flex: 1, fontFamily: \"ui-monospace,monospace\" } }, r.name),",
  "            r.engineSkipped ? h(\"span\", { style: { color: \"#d29922\", fontSize: \"11px\" } }, \"skip\") : null); }));",
  "      }",
  "      ctx.slots.inject(\"shell.overlay\", function () { return ctx.slots.register({ name: \"shell.overlay\", id: \"turnstile.plugin-list\" }, Card); });",
  "    };",
  "    return module.exports;",
  "  },",
  "});",
].join("\n");
writeFileSync(join(out, "lib/client.js"), client + "\n");
console.log("built popup v2 at " + out + "  rows=" + rows.length);