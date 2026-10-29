// Build the mini popup bundle from tools/popup-client.template.js.
// Data comes from manage.mjs --json; the template is copied verbatim with the snapshot injected.
// usage: node tools/build-popup.mjs <profileDir> [outDir]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.mjs";

const profile = process.argv[2];
const out = process.argv[3] || join(ROOT, "popup");
if (!profile) { console.error("usage: node tools/build-popup.mjs <profileDir> [outDir]"); process.exit(2); }

const raw = execFileSync(process.execPath, [join(ROOT, "tools/manage.mjs"), profile, "--json"], { encoding: "utf8" });
const parsed = JSON.parse(raw);
const rows = parsed.rows.map((r) => ({ name: r.name, disabled: r.disabled, engineSkipped: r.engineSkipped }));
const data = { profile: parsed.profile, generatedAt: new Date().toISOString(), rows };

mkdirSync(join(out, "lib"), { recursive: true });
const pkg = {
  name: "turnstile-popup", version: "0.0.3", private: true, type: "module",
  main: "./lib/index.js",
  exports: { ".": "./lib/index.js", "./client": "./lib/client.js", "./cordis.patch.yml": "./cordis.patch.yml" },
  dsh: { bundle: { patch: "./cordis.patch.yml" }, client: { platform: "web", inject: ["@deepseek-ai/dsh-client-ui-slots"] } },
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2));
const patchRows = ["- insert:", "    - id: turnstile-popup", "      name: turnstile-popup", "      config:", "        profile: mini", ""];
writeFileSync(join(out, "cordis.patch.yml"), patchRows.join("\n"));
const tpl = readFileSync(join(ROOT, "tools/popup-client.template.js"), "utf8");
writeFileSync(join(out, "lib/client.js"), tpl.replace("/*__TURNSTILE_DATA__*/null", JSON.stringify(data)));
console.log("built popup at " + out + "  rows=" + rows.length);
