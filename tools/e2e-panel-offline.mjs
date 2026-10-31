#!/usr/bin/env node
// Offline integration test for the real panel client + host routes.
// Uses real mouse coordinates, a temporary DSH profile, and no live DSH installation.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "../plugins/turnstile-popup/lib/index.js";
import { loadYaml } from "./config.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const state = join(root, "state");
mkdirSync(state, { recursive: true });
const tmp = mkdtempSync(join(state, ".panel-e2e-"));
const home = join(tmp, "home");
const profile = join(home, "profiles", "mini");
const patchPath = join(profile, "cordis.patch.yml");
const steps = [];
const pageErrors = [];
let browser = null;
let server = null;
let skipped = false;

const ok = (name, pass, detail = "") => {
  steps.push({ name, pass, detail });
  console.log((pass ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFile(predicate, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate(readFileSync(patchPath, "utf8"))) return true;
    await sleep(100);
  }
  return false;
}

try {
  const plugins = [
    { name: "plug-alpha", row: "alpha-row", inject: ["@deepseek-ai/dsh-client-ui-settings"] },
    { name: "plug-beta", row: "beta-row", inject: [] },
    { name: "plug-gamma", row: "gamma-row", inject: ["@deepseek-ai/dsh-client-ui-settings"] },
  ];
  const dependencies = {};
  for (const p of plugins) {
    dependencies[p.name] = "1.0.0";
    write(join(profile, "node_modules", p.name, "package.json"), JSON.stringify({
      name: p.name, version: "1.0.0",
      dsh: { bundle: { patch: "cordis.patch.yml" }, client: { inject: p.inject } },
    }, null, 2));
    write(join(profile, "node_modules", p.name, "cordis.patch.yml"), `- insert:\n    - id: ${p.row}\n      name: '${p.name}'\n`);
    write(join(profile, "node_modules", p.name, "README.md"), "anchor: top-left\nanchor: bottom-right\n");
  }
  write(join(profile, "package.json"), JSON.stringify({
    name: "panel-e2e", private: true, dependencies,
    dsh: { profile: { bundles: plugins.map((p) => p.name) } },
  }, null, 2));
  write(patchPath, "- id: alpha-row\n  name: plug-alpha\n  config:\n    anchor: top-left\n    customSetting: keep-me\n- id: beta-row\n  name: plug-beta\n  disabled: true\n");

  write(join(tmp, "state", "report-mini.json"), JSON.stringify({
    profile: "mini", result: "blocked", blocking: ["prompt-vars"],
    checks: [
      { name: "prompt-vars", ok: false, findings: [{ message: "unsupported variable" }] },
      { name: "dependency-risk", ok: true, findings: [] },
    ],
  }));
  // B17: one state dir, not two. The panel previously read the report from HOME/state and the
  // occupancy map from STATE, so the two could describe different moments.
  const turnstileState = join(tmp, "state");
  write(join(tmp, "state", "occupancy-mini.json"), JSON.stringify({
    findings: [{ surface: "ui-settings" }],
    surfaces: [{
      surface: "ui-settings", plugins: ["plug-alpha", "plug-gamma"], count: 2,
      hardcoded: ["plug-gamma"], contested: true, anchors: { "plug-alpha": "top-left" },
    }],
  }));

  process.env.DSH_HOME = home;
  process.env.DSH_TURNSTILE_HOME = tmp;
  process.env.DSH_TURNSTILE_STATE = turnstileState;
  const routes = [];
  const ctx = {
    webServer: { register(route) { routes.push(route); } },
    effect(fn) { fn(); return () => {}; },
  };
  apply(ctx, { profile: "mini" });

  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<!doctype html><html><body><div id=\"root\"></div></body></html>");
      return;
    }
    const route = routes.find((r) => r.path === pathname);
    if (!route) { res.statusCode = 404; res.end("not found"); return; }
    Promise.resolve(route.handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.end(String(error && error.message || error));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const launchErrors = [];
  for (const channel of ["msedge", "chrome"]) {
    try { browser = await chromium.launch({ channel, headless: true }); break; }
    catch (error) { launchErrors.push(error); }
  }
  if (!browser) {
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) { launchErrors.push(error); }
  }
  if (!browser) {
    skipped = true;
    console.log("SKIP: no Edge/Chrome/Chromium browser available");
    console.log(String(launchErrors[launchErrors.length - 1] || "").slice(0, 180));
  } else {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    await page.goto(base + "/?token=e2e-token", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: join(root, "node_modules", "react", "umd", "react.production.min.js") });
    await page.addScriptTag({ path: join(root, "node_modules", "react-dom", "umd", "react-dom.production.min.js") });
    await page.evaluate(() => {
      window.__ModuleLoader__ = { load(definition) { window.__turnstileDefinition = definition; } };
    });
    await page.addScriptTag({ path: join(root, "plugins", "turnstile-popup", "lib", "client.js") });
    await page.evaluate(() => {
      const exported = window.__turnstileDefinition.factory(() => window.React);
      const records = new Map([["shell.overlay", { declaredBy: "e2e", entries: new Map([["panel", { id: "panel" }]]) }]]);
      const ctx = { slots: {
        _core: { records },
        register(meta, component) { return component; },
        // The client registers more than one slot now; only the overlay is the panel.
        inject(slot, fn) { const c = fn(); if (slot === 'shell.overlay') window.__PanelComponent = c; },
      } };
      exported.apply(ctx);
      window.ReactDOM.createRoot(document.getElementById("root")).render(window.React.createElement(window.__PanelComponent));
    });
    await page.waitForSelector('[data-testid="panel"]');
    // Rows live inside a collapsible section; open it before counting. The panel keeps
    // refreshing, so click until the section reports expanded.
    for (let attempt = 0; attempt < 4; attempt++) {
      const toggle = page.locator('[data-testid="sec-list"]').first();
      if (!(await toggle.count())) break;
      if ((await toggle.getAttribute('aria-expanded')) === 'true') break;
      await page.waitForTimeout(250);
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500);
    console.log('  debug rows=' + (await page.locator('[data-testid^="row-"]').count()) + ' panel=' + ((await page.locator('[data-testid="panel"]').first().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 160)));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="row-"]').length === 3);

    async function mouseClick(locator) {
      const target = locator.first();
      const expectMounted = (await target.getAttribute("data-testid")) !== "close";
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (!box) throw new Error("target has no clickable coordinates");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(120);
      // Writes are two-step: confirm whatever plan the click produced.
      const confirm = page.locator('[data-testid="confirm-apply"]').first();
      if (await confirm.count()) {
        const box2 = await confirm.boundingBox();
        if (box2) { await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2); await page.waitForTimeout(200); }
      }
      if (expectMounted && !(await page.locator('[data-testid="panel"]').count())) throw new Error("panel unmounted after click");
    }

    ok("panel mounts with real client and routes", true);
    ok("gate verdict comes from report", /1 项阻塞/.test(await page.locator('[data-testid="gate-badge"]').innerText()));
    ok("all three plugins render", (await page.locator('[data-testid^="row-"]').count()) === 3);

    await page.locator('[data-testid="search"]').fill("not-a-plugin");
    ok("search shows an explicit empty state", (await page.locator('[data-testid="empty-list"]').count()) === 1);
    await page.locator('[data-testid="search"]').fill("");
    ok("clearing search restores rows", (await page.locator('[data-testid^="row-"]').count()) === 3);

    await mouseClick(page.locator('[data-testid="row-plug-alpha"]'));
    const detail = await page.locator('[data-testid="detail"]').innerText();
    ok("row click opens complete property panel", detail.includes("alpha-row") && detail.includes("UI 面") && detail.includes("位置"));
    await page.waitForFunction(() => document.querySelectorAll("datalist option").length >= 2);
    ok("anchor suggestions work with token query", (await page.locator("datalist option").count()) >= 2);

    await page.locator('[data-testid="anchor-input"]').fill("bottom-right");
    await mouseClick(page.locator('[data-testid="anchor-apply"]'));
    const anchorConfirm = page.locator('[data-testid="confirm-apply"]').first();
    if (await anchorConfirm.count()) { await page.waitForTimeout(200); await mouseClick(anchorConfirm); }
    const anchorWrote = await waitFile((text) => text.includes("anchor: bottom-right"));
    ok("position click writes the requested anchor", anchorWrote);
    ok("position write preserves unrelated settings", readFileSync(patchPath, "utf8").includes("customSetting: keep-me"));

    const toggleBefore = readFileSync(patchPath, "utf8");
    await mouseClick(page.locator('[data-testid="toggle"]'));
    // Writes are two-step now: the panel shows a plan and a confirmation token first.
    const confirmBtn = page.locator('[data-testid="confirm-apply"]').first();
    if (await confirmBtn.count()) { await page.waitForTimeout(200); await mouseClick(confirmBtn); }
    // The block keeps every other key; `disabled: true` is inserted, not the block replaced.
    const disabled = await waitFile((text) => /^- id: alpha-row\n(?:.*\n)*?  disabled: true\n/m.test(text));
    ok("toggle click adds a disabled override", disabled);
    ok("disabled override keeps original config", readFileSync(patchPath, "utf8").includes("customSetting: keep-me"));
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="toggle"]');
      return button && !button.disabled && button.textContent.includes("启用");
    });
    await mouseClick(page.locator('[data-testid="toggle"]'));
    const restored = await waitFile((text) => text === toggleBefore);
    ok("second toggle restores patch byte-for-byte", restored, restored ? "" : JSON.stringify({ before: toggleBefore, after: readFileSync(patchPath, "utf8") }));

    const { yaml, schema } = loadYaml();
    let yamlValid = true;
    try { yaml.load(readFileSync(patchPath, "utf8"), { schema }); } catch { yamlValid = false; }
    ok("patch remains valid YAML after round trip", yamlValid);

    await mouseClick(page.locator('[data-testid="detail-close"]'));
    await mouseClick(page.locator('[data-testid="sec-occupancy"]'));
    ok("occupancy section expands on click", (await page.locator('[data-testid="sec-occupancy"]').getAttribute("aria-expanded")) === "true");
    await mouseClick(page.locator('[data-testid="sec-topology"]'));
    ok("topology section renders SVG", (await page.locator('[data-testid="topology"]').count()) === 1);
    await mouseClick(page.locator('[data-testid="refresh"]'));
    ok("refresh keeps panel and rows mounted", (await page.locator('[data-testid^="row-"]').count()) === 3);

    const popupPromise = page.context().waitForEvent("page");
    await mouseClick(page.locator('[data-testid="console-open"]'));
    const consolePage = await popupPromise;
    await consolePage.waitForSelector('[data-testid="metric-architecture"]');
    ok("full-window button opens the real browser console", consolePage.url().includes("/turnstile/console?token=e2e-token"));
    ok("host console returns the same profile data", (await consolePage.locator(".page-head p").innerText()).includes("mini"));
    await consolePage.close();

    await page.evaluate(() => {
      function RootEntry() {}
      function InspectorChild() {}
      const target = document.createElement("button");
      target.dataset.testid = "inspect-target";
      target.textContent = "inspect me";
      target.style.cssText = "position:fixed;left:40px;top:40px;width:180px;height:48px;z-index:10";
      window.__inspectTargetClicks = 0;
      target.addEventListener("click", () => { window.__inspectTargetClicks++; });
      target.__reactFiber$e2e = {
        type: InspectorChild,
        memoizedProps: {},
        return: {
          type: RootEntry,
          memoizedProps: { slotKey: "shell.overlay", entry: { options: { id: "turnstile.plugin-list" } } },
          return: null,
        },
      };
      document.body.appendChild(target);
    });
    await mouseClick(page.locator('[data-testid="inspect"]'));
    ok("crosshair enters explicit pick mode", (await page.locator('[data-testid="inspect"]').getAttribute("aria-pressed")) === "true");
    const inspectBox = await page.locator('[data-testid="inspect-target"]').boundingBox();
    await page.mouse.move(inspectBox.x + inspectBox.width / 2, inspectBox.y + inspectBox.height / 2);
    await page.waitForSelector('[data-testid="inspect-highlight"]');
    ok("crosshair hover draws the real target bounds", true);
    await page.mouse.click(inspectBox.x + inspectBox.width / 2, inspectBox.y + inspectBox.height / 2);
    await page.waitForSelector('[data-testid="inspect-result"]');
    const inspected = await page.locator('[data-testid="inspect-result"]').innerText();
    ok("crosshair resolves the RootEntry slot and entry", inspected.includes("shell.overlay") && inspected.includes("turnstile.plugin-list") && inspected.includes("不做猜测"), inspected.replace(/\n/g, " | "));
    ok("picked click does not activate the original UI", (await page.evaluate(() => window.__inspectTargetClicks)) === 0);
    await mouseClick(page.locator('[data-testid="inspect"]'));
    await page.keyboard.press("Escape");
    ok("Escape cancels crosshair mode", (await page.locator('[data-testid="inspect"]').getAttribute("aria-pressed")) === "false" && (await page.locator('[data-testid="inspect-highlight"]').count()) === 0);
    await page.locator('[data-testid="inspect-target"]').evaluate((el) => el.remove());

    await page.setViewportSize({ width: 390, height: 760 });
    const responsiveBox = await page.locator('[data-testid="panel"]').boundingBox();
    ok("panel fits a narrow viewport", responsiveBox.x >= 0 && responsiveBox.x + responsiveBox.width <= 391, Math.round(responsiveBox.width) + "px");
    await page.setViewportSize({ width: 1280, height: 900 });

    await mouseClick(page.locator('[data-testid="close"]'));
    ok("close collapses to a reopen button", (await page.locator('[data-testid="reopen"]').count()) === 1);
    await page.locator('[data-testid="reopen"]').scrollIntoViewIfNeeded();
    const reopenBox = await page.locator('[data-testid="reopen"]').boundingBox();
    await page.mouse.click(reopenBox.x + reopenBox.width / 2, reopenBox.y + reopenBox.height / 2);
    await page.waitForSelector('[data-testid="panel"]');
    ok("reopen restores the panel", true);

    await page.screenshot({ path: join(state, "panel-offline.png"), fullPage: true });
    const handle = page.locator('[data-testid="drag-handle"]');
    const hb = await handle.boundingBox();
    const before = await page.locator('[data-testid="panel"]').boundingBox();
    await page.mouse.move(hb.x + 20, hb.y + 8);
    await page.mouse.down();
    await page.mouse.move(hb.x - 100, hb.y + 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.locator('[data-testid="panel"]').boundingBox();
    ok("mouse drag moves the panel", Math.abs(after.x - before.x) > 40 || Math.abs(after.y - before.y) > 40, JSON.stringify({ before, after, handle: hb }));
    const savedPos = await page.evaluate(() => localStorage.getItem("turnstile.panelPos"));
    ok("drag position persists", Boolean(savedPos), savedPos || "none");
    ok("no uncaught browser errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 100));
  }
} catch (error) {
  ok("offline e2e completed without throwing", false, String(error && error.message || error).slice(0, 180));
  if (pageErrors.length) console.log("  page errors: " + pageErrors.slice(0, 3).join(" | ").slice(0, 400));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
}

const failed = steps.filter((step) => !step.pass).length;
console.log("");
console.log(`${steps.length - failed}/${steps.length} checks passed`);
if (skipped) {
  console.log("coverage incomplete: exit 3");
  process.exit(3);
}
process.exit(failed ? 1 : 0);
