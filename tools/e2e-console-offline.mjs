#!/usr/bin/env node
// Full-window console mouse test. Uses a temporary profile copy and real mouse events.
import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { copyTreeSafe } from './safe-copy.mjs';
import { createConsoleServer } from './console-server.mjs';
import { viewStatePath } from '../plugins/turnstile-popup/lib/view-state.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stateDir = join(root, 'state');
mkdirSync(stateDir, { recursive: true });
const tmp = mkdtempSync(join(stateDir, '.console-e2e-'));
const profileDir = join(tmp, 'console-fixture');
// A fixture must not remember a developer's interactive session: start from default view state.
try { rmSync(join(profileDir, '.turnstile', 'turnstile-view.json'), { force: true }); } catch {}
copyTreeSafe(join(root, 'tests', 'console-fixture'), profileDir);
const patchPath = join(profileDir, 'cordis.patch.yml');
const steps = [], pageErrors = [];
let browser, server;
const ok = (name, pass, detail = '') => {
  steps.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
};

try {
  server = createConsoleServer({ profileDir, stateDir: join(profileDir, '.turnstile') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const launchErrors = [];
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); break; }
    catch (e) { launchErrors.push(e); }
  }
  if (!browser) {
    try { browser = await chromium.launch({ headless: true }); }
    catch (e) { launchErrors.push(e); }
  }
  if (!browser) {
    console.log('SKIP: no Edge/Chrome/Chromium browser available');
    console.log(String(launchErrors.at(-1) || '').slice(0, 180));
    process.exitCode = 3;
  } else {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="metric-architecture"]');
    await page.waitForFunction(() => document.querySelector('#connection').textContent === '数据已读取');

    async function click(target, button = 'left') {
      const loc = typeof target === 'string' ? page.locator(target).first() : target.first();
      // Read coordinates in the same DOM turn as scrolling; live refreshes may
      // replace a row between two separate Playwright calls.
      let box = { width: 0, height: 0 };
      for (let attempt = 0; attempt < 3 && (!box.width || !box.height); attempt++) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        // A live re-render can detach the node between lookup and measurement; retry instead of throwing.
        box = await loc.evaluate((el) => {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }).catch(() => ({ width: 0, height: 0 }));
        if (!box.width || !box.height) await page.waitForTimeout(120);
      }
      if (!box.width || !box.height) throw new Error('no clickable coordinates: ' + String(target));
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
      await page.waitForTimeout(90);
    }
    const count = (selector) => page.locator(selector).count();
    const text = (selector) => page.locator(selector).first().innerText();

    ok('full-window overview mounts', (await count('[data-testid="metric-plugins"]')) === 1);
    ok('plugin action is disabled without a selection', await page.locator('[data-testid="toggle-plugin"]').isDisabled());
    const snapshot = await (await page.request.get(base + '/api/console')).json();
    ok('arbitrary config fields become drillable nodes', ['density', 'route'].every((key) => snapshot.architecture.nodes.some((n) => n.id.endsWith(':config:' + key))));
    const slotSource = snapshot.architecture.nodes.find((n) => n.id === 'plugin:0:client:surface:0:row:0:config:slot:source');
    ok('config source points to its exact YAML line', slotSource?.source?.line === 5, JSON.stringify(slotSource?.source));
    const dimensions = await page.evaluate(() => ({ w: document.querySelector('.app').getBoundingClientRect().width, vw: innerWidth, h: document.querySelector('.app').getBoundingClientRect().height, vh: innerHeight }));
    ok('console occupies the whole browser window', dimensions.w === dimensions.vw && dimensions.h === dimensions.vh, JSON.stringify(dimensions));
    await page.screenshot({ path: join(stateDir, 'console-overview.png'), fullPage: true });

    await click('[data-testid="focus-mode"]');
    ok('focus mode hides navigation and inspector', await page.evaluate(() => document.body.classList.contains('focus')));
    await click('[data-testid="focus-mode"]');
    ok('focus mode restores the three columns', !(await page.evaluate(() => document.body.classList.contains('focus'))));
    await click('[data-testid="console-refresh"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="console-refresh"]').disabled);
    ok('refresh button reloads real snapshot', (await text('#connection')) === '数据已读取');

    for (const view of ['checks', 'plugins', 'surfaces', 'architecture', 'history', 'overview']) {
      await click('[data-testid="nav-' + view + '"]');
      ok('navigation opens ' + view, (await page.locator('[data-testid="nav-' + view + '"].active').count()) === 1);
    }
    await click('[data-testid="metric-plugins"]');
    ok('overview metric opens plugin inventory', (await count('[data-testid="plugin-plug-alpha"]')) === 1);
    await page.locator('[data-testid="global-search"]').fill('alpha');
    ok('Everything-style input filters immediately', (await count('tbody tr')) === 1 && (await count('[data-testid="plugin-plug-alpha"]')) === 1);
    await page.locator('[data-testid="global-search"]').fill('no-such-plugin');
    ok('filtered empty state is explicit', (await count('[data-testid="empty"]')) === 1);
    await page.locator('[data-testid="global-search"]').fill('');
    await page.locator('[data-testid="plugin-status"]').selectOption('disabled');
    ok('status filter shows only disabled plugins', (await count('tbody tr')) === 1 && (await count('[data-testid="plugin-plug-beta"]')) === 1);
    await page.locator('[data-testid="plugin-status"]').selectOption('all');

    await click('[data-testid="plugin-plug-alpha"]');
    ok('plugin selection fills property inspector', (await text('#inspector')).includes('alpha-row'));
    await click('[data-testid="sort-name"]');
    ok('column header sorts plugins descending', (await page.locator('tbody tr').first().innerText()).includes('plug-gamma'));
    await click('[data-testid="sort-name"]');
    ok('second header click restores ascending order', (await page.locator('tbody tr').first().innerText()).includes('plug-alpha'));
    await click('[data-testid="plugin-plug-alpha"]');
    const originalPatch = readFileSync(patchPath, 'utf8');
    await click('[data-testid="toggle-plugin"]');
    await page.waitForSelector('[data-testid="patch-dialog"]');
    ok('toolbar generates a patch preview without writing', (await text('[data-testid="patch-after"]')).includes('disabled: true') && readFileSync(patchPath, 'utf8') === originalPatch);
    await click('[data-testid="cancel-toggle"]');
    ok('cancel closes preview and preserves the patch', (await count('[data-testid="patch-dialog"]')) === 0 && readFileSync(patchPath, 'utf8') === originalPatch);
    await click('[data-testid="plugin-plug-alpha"]', 'right');
    await click('[data-testid="context-properties"]');
    ok('context properties uses the selected-row inspector', (await count('[data-testid="context-menu"]')) === 0 && (await text('#inspector')).includes('plug-alpha'));
    await click('[data-testid="plugin-plug-alpha"]', 'right');
    await click('[data-testid="context-locate"]');
    ok('context locate enters architecture', (await text('.arch-current')).includes('plug-alpha'));
    await click('[data-testid="nav-plugins"]');
    await click('[data-testid="plugin-plug-alpha"]', 'right');
    await click('[data-testid="context-toggle"]');
    await click('[data-testid="confirm-toggle"]');
    await page.waitForSelector('[data-testid="patch-dialog"]', { state: 'detached' });
    ok('confirmed stop writes disabled override to temporary mini patch', /disabled: true/.test(readFileSync(patchPath, 'utf8')));
    ok('snapshot delta marks the changed row', (await text('[data-testid="delta-strip"]')).includes('状态变化') && (await page.locator('[data-testid="plugin-plug-alpha"]').getAttribute('class')).includes('delta-toggled'));
    await page.locator('[data-testid="global-search"]').fill('alpha');
    const downloadPromise = page.waitForEvent('download');
    await click('[data-testid="export-filtered"]');
    const download = await downloadPromise;
    const exported = readFileSync(await download.path(), 'utf8');
    ok('export contains only the currently filtered row', exported.includes('plug-alpha') && !exported.includes('plug-beta'));
    await page.locator('[data-testid="global-search"]').fill('');
    await click('[data-testid="plugin-plug-alpha"]');
    await page.keyboard.press('Delete');
    await page.waitForSelector('[data-testid="patch-dialog"]');
    ok('Delete opens the same enable preview command', (await text('[data-testid="patch-dialog"]')).includes('启用'));
    await click('[data-testid="confirm-toggle"]');
    await page.waitForSelector('[data-testid="patch-dialog"]', { state: 'detached' });
    ok('enable round trip restores patch byte-for-byte', readFileSync(patchPath, 'utf8') === originalPatch);
    await click('[data-testid="details-toggle"]');
    ok('details toolbar hides the inspector', await page.evaluate(() => document.body.classList.contains('hide-inspector')));
    await page.keyboard.press('Control+l');
    ok('Ctrl+L restores the inspector', !(await page.evaluate(() => document.body.classList.contains('hide-inspector'))));
    await page.keyboard.press('Control+f');
    ok('Ctrl+F focuses the instant filter', await page.evaluate(() => document.activeElement?.dataset?.testid === 'global-search'));
    await page.keyboard.press('F5');
    await page.waitForFunction(() => !document.querySelector('[data-testid="console-refresh"]').disabled);
    ok('F5 performs a real snapshot refresh', (await text('#connection')) === '数据已读取');
    await click('[data-testid="inspector-actions"]');
    console.log('  debug inspector: ' + (await text('#inspector')).replace(/\n/g, ' | ').slice(0, 150));
    ok('actions are separate from properties', (await count('[data-testid="action-locate"]')) === 1);
    await click('[data-testid="action-locate"]');
    ok('locate action enters the exact plugin architecture node', (await text('.arch-current')).includes('plug-alpha'));
    await click('[data-testid="inspector-properties"]');
    ok('property tab switches back to values', (await text('#inspector')).includes('1.4.0'));
    ok('properties come from the model (row id present)', (await text('#inspector')).includes('行 id'));


    await click('[data-testid="breadcrumb-profile"]');
    const drill = [
      ['plugin:0', 'plug-alpha'],
      ['plugin:0:client', 'Client / browser'],
      ['plugin:0:client:surface:0', 'ui-settings'],
      ['plugin:0:client:surface:0:row:0', 'alpha-row'],
      ['plugin:0:client:surface:0:row:0:config:slot', 'settings.plugins'],
      ['plugin:0:client:surface:0:row:0:config:slot:source', 'cordis.patch.yml'],
    ];
    let reached = 0;
    for (const [id, label] of drill) {
      await click('[data-arch-id="' + id + '"]');
      reached++;
      ok('architecture drill ' + reached + ' opens ' + label, (await text('.arch-current')).includes(label));
    }
    ok('deepest leaf exposes a precise source link', (await page.locator('[data-testid="arch-source"]').getAttribute('href')).includes('cordis.patch.yml'));
    await page.screenshot({ path: join(stateDir, 'console-architecture-deep.png'), fullPage: true });
    await click('[data-testid="arch-back"]');
    ok('back button returns one real level', (await text('.arch-current')).includes('settings.plugins'));
    await click('[data-testid="breadcrumb-plugin:0"]');
    ok('breadcrumb jumps to an ancestor', (await text('.arch-current')).includes('plug-alpha'));
    await page.locator('[data-testid="global-search"]').fill('bottom-right');
    ok('architecture search crosses all depth levels', (await count('[data-arch-id]')) >= 1);
    await page.locator('[data-testid="global-search"]').fill('');

    await click('[data-testid="nav-surfaces"]');
    await click('[data-testid="surface-ui-settings"]');
    ok('surface row shows ownership properties', (await text('#inspector')).includes('plug-gamma'));
    await click('[data-testid="inspector-actions"]');
    await click('[data-testid="action-locate"]');
    ok('surface action locates a concrete plugin-surface node', (await text('.arch-current')).includes('ui-settings'));

    await click('[data-testid="nav-checks"]');
    await click('[data-testid="check-prompt-vars"]');
    ok('check row exposes finding evidence and fix', (await text('#inspector')).includes('unsupported variable') && (await text('#inspector')).includes('replace'));

    await click('[data-testid="nav-history"]');
    await click('[data-testid="history-0"]');
    ok('history row has selectable details', (await text('#inspector')).includes('prompt-vars'));

    await click('[data-testid="nav-overview"]');
    await click('[data-testid="overview-surface-ui-settings"]');
    ok('overview attention row opens surface details', (await text('#inspector')).includes('ui-settings'));
    await page.setViewportSize({ width: 800, height: 760 });
    const narrow = await page.locator('#main').boundingBox();
    ok('narrow layout keeps the main workspace usable', narrow.width >= 350 && narrow.x >= 0);
    await page.setViewportSize({ width: 1440, height: 960 });
    // View state: a corrupt file must fall back (never blank the page), and a sort click must persist.
    writeFileSync(viewStatePath(join(profileDir, '.turnstile')), '{ broken json');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-overview"]');
    ok('corrupt view state falls back instead of breaking the page', (await page.locator('[data-testid="nav-overview"]').count()) === 1);
    await click('[data-testid="nav-plugins"]');
    let saved = null;
    for (let i = 0; i < 15 && !saved; i++) {
      await page.waitForTimeout(200);
      try { saved = JSON.parse(readFileSync(viewStatePath(join(profileDir, '.turnstile')), 'utf8')); } catch { saved = null; }
    }
    ok('view change is persisted', Boolean(saved) && saved.view === 'plugins', saved ? saved.view : 'not written');

    rmSync(patchPath);
    const noPatchResponse = await page.request.post(base + '/turnstile/toggle', { data: { package: 'plug-alpha', disable: true, dryRun: false } });
    ok('first disable creates a missing patch without a backup error', noPatchResponse.ok() && /disabled: true/.test(readFileSync(patchPath, 'utf8')));
    // A plugin with no config row cannot be patched: the action must be disabled and say why.
    await click('[data-testid="nav-plugins"]');
    await page.locator('[data-testid="global-search"]').fill('');
    const statusSel = page.locator('[data-testid="plugin-status"]').first();
    if (await statusSel.count()) await statusSel.selectOption('all').catch(() => {});
    await page.waitForTimeout(300);
    await click('[data-testid="plugin-plug-gamma"]');
    await click('[data-testid="inspector-actions"]');
    const rowless = page.locator('[data-testid="action-toggle"]').first();
    ok('row-less plugin disables the patch action', (await rowless.isDisabled()) === true);
    ok('disabled action explains itself', (await text('[data-testid="action-reason"]')).includes('没有配置行'));
    ok('no uncaught browser errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));
  }
} catch (e) {
  ok('console e2e completed without throwing', false, String(e?.message || e).slice(0, 220));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
}
const failed = steps.filter((s) => !s.pass).length;
console.log('');
console.log((steps.length - failed) + '/' + steps.length + ' checks passed');
if (failed) process.exitCode = 1;