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

// 以正式清单为准：inject 声明与四类入口都由真插件决定，构建不再另写一份
const realPkg = JSON.parse(readFileSync(join(ROOT, "plugins", "turnstile-popup", "package.json"), "utf8"));
mkdirSync(join(out, "lib"), { recursive: true });
const pkg = {
  name: "turnstile-popup", version: "0.0.3", private: true, type: "module",
  main: "./lib/index.js",
  exports: { ".": "./lib/index.js", "./client": "./lib/client.js", "./cordis.patch.yml": "./cordis.patch.yml" },
  dsh: { bundle: { patch: "./cordis.patch.yml" }, client: { platform: "web", inject: realPkg.dsh.client.inject } },
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2));
const patchRows = ["- insert:", "    - id: turnstile-popup", "      name: turnstile-popup", "      config:", "        profile: mini", ""];
writeFileSync(join(out, "cordis.patch.yml"), patchRows.join("\n"));
// 直接读正式 client.js：旧模板与正式文件分叉过，构建产物会丢掉四类入口
const tpl = readFileSync(join(ROOT, "plugins", "turnstile-popup", "lib", "client.js"), "utf8");
const fbStart = tpl.indexOf('var FALLBACK = ');
const fbEnd = fbStart < 0 ? -1 : tpl.indexOf('\n', fbStart);
let built = tpl;
if (fbStart >= 0 && fbEnd > fbStart) {
  built = tpl.slice(0, fbStart) + 'var FALLBACK = ' + JSON.stringify(data) + ';' + tpl.slice(fbEnd);
} else {
  console.error('WARNING: 正式 client.js 里没有 var FALLBACK 行，构建产物不会带数据快照');
}
writeFileSync(join(out, "lib/client.js"), built);
writeFileSync(join(out, "lib/client.js"), tpl.replace("/*__TURNSTILE_DATA__*/null", JSON.stringify(data)));
console.log("built popup at " + out + "  rows=" + rows.length);
