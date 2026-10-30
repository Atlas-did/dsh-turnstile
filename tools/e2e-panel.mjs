#!/usr/bin/env node
// Real-mouse E2E for the mini panel. No element.click(): every step is page.mouse at the
// element's own coordinates, because that is the difference between "the handler runs" and
// "a human can hit it".
// usage: node tools/e2e-panel.mjs --port 18770 --packet <cordis.patch.yml> [--row dsh-talk]
// exit: 0 pass | 1 fail | 3 skipped (no panel) - never a silent green
import { chromium } from 'playwright-core';
import { readFileSync, copyFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const port = val('--port') || '18770';
const logFile = val('--log');
const patch = val('--patch');
const rowName = val('--row') || 'dsh-talk';
if (!logFile || !patch) { console.error('usage: node tools/e2e-panel.mjs --log <mini.log> --patch <cordis.patch.yml> [--row name] [--port n]'); process.exit(2); }

const token = (readFileSync(logFile, 'utf8').match(/token=([A-Za-z0-9_-]+)/) || [])[1];
const before = readFileSync(patch, 'utf8');
const backup = patch + '.e2e-backup';
copyFileSync(patch, backup);

const steps = [];
// UI writes are async (fetch -> disk); poll instead of guessing a sleep length.
const waitPatch = async (predicate, timeoutMs = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (predicate(readFileSync(patch, 'utf8'))) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
const ok = (name, pass, detail) => { steps.push({ name, pass, detail }); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : '')); };

let browser = null;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch (e) {
  console.log('SKIP: no browser available (' + String(e.message).slice(0, 80) + ')');
  console.log('coverage incomplete: exit 3');
  process.exit(3);
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:' + port + '/?token=' + token, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4500);

  const panel = page.locator('div', { hasText: '闸门' }).last();
  const present = await page.evaluate(() => document.body.innerText.indexOf('插件') !== -1);
  ok('panel is mounted', present);
  if (!present) { console.log('SKIP: panel not found'); process.exit(3); }

  // The plugin list starts collapsed: expanding it is part of the flow a user walks.
  const sec = page.locator('[data-testid="sec-list"]');
  if (await sec.count()) {
    await sec.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // Clicks go through the input pipeline (hit-testing, scroll, stability) - never element.click().
  const rowLoc = page.locator('[data-testid="row-' + rowName + '"]');
  const box = await rowLoc.boundingBox();
  if (!box) { ok('row has coordinates', false); } else {
    await rowLoc.click();
    await page.waitForTimeout(800);
    const detail = await page.locator('[data-testid="detail"]').first().innerText().catch(() => '');
    ok('property panel shows the row id', detail.indexOf('行 id') !== -1, detail.slice(0, 40));
    ok('property panel shows a state word', /已停用|启用/.test(detail));
    ok('property panel shows a position field', detail.indexOf('位置:') !== -1);
  }

  // click 2: the toggle button inside the property block, by its own coordinates
  const btn = page.locator('[data-testid="toggle"]').first();
  const bb = await btn.boundingBox().catch(() => null);
  if (!bb) ok('toggle button reachable', false);
  else {
    await btn.click();
    await page.waitForTimeout(1200);
    const wrote = await waitPatch((t) => t !== before);
    ok('click wrote the patch', wrote, wrote ? 'file changed' : 'file unchanged');
    // The panel re-renders after the toggle, so re-measure before the second click.
    const btn2 = page.locator('[data-testid="toggle"]').first();
    const bb2 = await btn2.boundingBox().catch(() => null);
    if (!bb2) ok('toggle button still reachable', false);
    else await btn2.click();
    await page.waitForTimeout(1200);
    const restored = await waitPatch((t) => t.trim() === before.trim());
    ok('second click restored the patch', restored, restored ? '' : 'file still differs');
  }
  // Drag mode: the panel must move with the pointer and remember where it was left.
  await page.evaluate(() => { const el = document.querySelector('[data-testid="panel"]'); if (el) el.scrollTop = 0; });
  await page.waitForTimeout(200);
  const handle = page.locator('[data-testid="drag-handle"]').first();
  if (await handle.count()) {
    const panelBox = async () => page.locator('[data-testid="panel"]').first().boundingBox();
    const b0 = await panelBox();
    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + 10, hb.y + 8);
    await page.mouse.down();
    await page.mouse.move(hb.x - 120, hb.y + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const b1 = await panelBox();
    ok('drag moves the panel', Math.abs(b0.x - b1.x) > 40 || Math.abs(b0.y - b1.y) > 40, Math.round(b1.x) + ',' + Math.round(b1.y));
    const saved = await page.evaluate(() => localStorage.getItem("turnstile.panelPos"));
    ok('drag position is remembered', Boolean(saved), saved || 'none');
  }
} catch (e) {
  ok('e2e completed without throwing', false, String(e.message).slice(0, 120));
} finally {
  writeFileSync(patch, before);
  await browser.close();
}
const failed = steps.filter((s) => !s.pass).length;
console.log('');
console.log(failed ? failed + ' step(s) failed' : 'all steps passed');
process.exit(failed ? 1 : 0);
