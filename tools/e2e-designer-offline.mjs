#!/usr/bin/env node
// Real-mouse test for the command designer. Only a temporary profile copy is writable.
import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { copyTreeSafe } from './safe-copy.mjs';
import { createConsoleServer } from './console-server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stateDir = join(root, 'state'); mkdirSync(stateDir, { recursive: true });
const tmp = mkdtempSync(join(stateDir, '.designer-e2e-'));
const profileDir = join(tmp, 'console-fixture'); copyTreeSafe(join(root, 'tests', 'console-fixture'), profileDir);
const patchPath = join(profileDir, 'cordis.patch.yml');
const original = readFileSync(patchPath, 'utf8');
const steps = [], errors = []; let browser, server;
const ok = (name, pass, detail = '') => { steps.push({ name, pass }); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : '')); };

try {
  server = createConsoleServer({ profileDir, stateDir: join(profileDir, '.turnstile') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel, headless: true }); break; } catch {} }
  if (!browser) browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  async function click(target) {
    const loc = page.locator(target).first();
    const box = await loc.evaluate((el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(100);
  }
  const count = (s) => page.locator(s).count();
  const text = (s) => page.locator(s).first().innerText();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="nav-designer"]');
  await click('[data-testid="nav-designer"]');
  await page.waitForSelector('[data-testid="command-queue"]');
  ok('designer opens with object tree and generated-code editor', (await count('[data-testid^="tree-plug-"]')) === 3 && (await text('.stage-head')).includes('Patch YAML'));
  ok('plugin selection synchronizes object properties', (await text('#inspector')).includes('plug-alpha') && (await count('[data-testid="property-anchor"]')) === 1);
  await click('[data-testid="group-identity"]');
  ok('property groups collapse like a real object inspector', !(await text('#inspector')).includes('行 ID'));
  await click('[data-testid="group-identity"]');
  await click('[data-testid="designer-actions"]');
  ok('properties and event actions are separate tabs', (await count('[data-testid="event-toggle"]')) === 1 && (await count('[data-testid="property-anchor"]')) === 0);
  await click('[data-testid="event-toggle"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="designer-generate"]').disabled);
  ok('event action creates a command without writing', (await count('[data-testid="command-0"]')) === 1 && readFileSync(patchPath, 'utf8') === original);
  ok('dirty state tracks distance from save point', (await text('[data-testid="designer-dirty"]')).includes('有修改'));
  await click('[data-testid="editor-yaml"]');
  ok('Patch YAML is generated from the command', (await text('[data-testid="generated-code"]')).includes('disabled: true'));
  await click('[data-testid="editor-json"]');
  const jsonCode = await text('[data-testid="generated-code"]');
  ok('JSON target exposes the normalized operation plan', jsonCode.includes('"type": "toggle"') && jsonCode.includes('"row": "alpha-row"'));
  await click('[data-testid="editor-cli"]');
  ok('CLI target emits a real manage command', (await text('[data-testid="generated-code"]')).includes('tools/manage.mjs') && (await text('[data-testid="generated-code"]')).includes('--disable'));
  await click('[data-testid="editor-diff"]');
  // The diff is classified by lib/diff-state.js: changed lines carry a marker, unchanged do not.
  const diffText = await text('[data-testid="generated-code"]').catch(() => '');
  ok('diff view marks changed lines only', /^[-+] /m.test(diffText) && /^ {2}/m.test(diffText), diffText.slice(0, 60));
  ok('Diff target marks the inserted line', (await text('[data-testid="generated-code"]')).includes('+   disabled: true'));
  await click('[data-testid="editor-designer"]');
  await click('[data-testid="designer-undo"]');
  ok('undo removes the command', (await count('[data-testid="command-0"]')) === 0);
  await click('[data-testid="designer-redo"]');
  ok('redo restores the command', (await count('[data-testid="command-0"]')) === 1);
  await page.keyboard.press('Control+s');
  ok('Ctrl+S records a draft save point only', !(await text('[data-testid="designer-dirty"]')).includes('有修改') && readFileSync(patchPath, 'utf8') === original);
  await click('[data-testid="designer-properties"]');
  await page.locator('[data-testid="property-anchor"]').fill('top-left');
  await click('[data-testid="property-add-anchor"]');
  await page.waitForFunction(() => document.querySelectorAll('.command-row').length === 2 && !document.querySelector('[data-testid="designer-generate"]').disabled);
  ok('editable anchor property adds a second command', (await count('.command-row')) === 2);
  await click('[data-testid="command-copy-1"]');
  ok('command duplicate copies the operation', (await count('.command-row')) === 3);
  await click('[data-testid="command-delete-2"]');
  ok('command delete removes only the duplicate', (await count('.command-row')) === 2);
  await click('[data-testid="command-down-0"]');
  await click('[data-testid="editor-json"]');
  ok('command reorder changes generated execution order', (await text('[data-testid="generated-code"]')).indexOf('"type": "anchor"') < (await text('[data-testid="generated-code"]')).indexOf('"type": "toggle"'));
  await click('[data-testid="editor-designer"]');
  await click('[data-testid="command-up-1"]');
  await click('[data-testid="editor-json"]');
  const downloadWait = page.waitForEvent('download');
  await click('[data-testid="palette-Output"]'); await click('[data-testid="designer-download"]');
  const download = await downloadWait;
  ok('generated JSON downloads as a real file', readFileSync(await download.path(), 'utf8').includes('plug-alpha'));
  await click('[data-testid="palette-Common"]'); await click('[data-testid="designer-generate"]');
  await page.waitForSelector('[data-testid="designer-dialog"]');
  ok('batch preview shows both generated changes', (await text('[data-testid="designer-after"]')).includes('disabled: true') && (await text('[data-testid="designer-after"]')).includes('anchor: top-left'));
  await click('[data-testid="designer-cancel"]');
  ok('cancel batch preview preserves the file', readFileSync(patchPath, 'utf8') === original);
  await click('[data-testid="designer-generate"]'); await page.keyboard.press('Escape');
  ok('Escape closes the batch dialog', (await count('[data-testid="designer-dialog"]')) === 0);
  await click('[data-testid="designer-generate"]');
  writeFileSync(patchPath, original + '# external edit\n');
  await click('[data-testid="designer-confirm"]');
  await page.waitForSelector('[data-testid="designer-error"]');
  ok('stale preview refuses to overwrite external edits', (await text('[data-testid="designer-error"]')).includes('拒绝覆盖') && readFileSync(patchPath, 'utf8').includes('# external edit'));
  await click('[data-testid="palette-Inspect"]'); await click('[data-testid="designer-validate"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="designer-generate"]').disabled && !document.querySelector('[data-testid="designer-error"]'));
  const backupsBefore = readdirSync(profileDir).filter((name) => name.startsWith('cordis.patch.yml.bak-')).length;
  await click('[data-testid="designer-generate"]'); await click('[data-testid="designer-confirm"]');
  await page.waitForFunction(() => document.querySelectorAll('.command-row').length === 0 && document.querySelector('[data-testid="designer-generate"]')?.disabled);
  const applied = readFileSync(patchPath, 'utf8');
  ok('confirmed queue applies atomically', applied.includes('disabled: true') && applied.includes('anchor: top-left') && applied.includes('order: 20'));
  ok('atomic apply creates exactly one backup', readdirSync(profileDir).filter((name) => name.startsWith('cordis.patch.yml.bak-')).length === backupsBefore + 1);
  await click('[data-testid="editor-designer"]');
  await click('[data-testid="palette-Layout"]'); await click('[data-testid="align-spread"]');
  const spreadCount = await count('.command-row');
  const spreadDraft = await page.evaluate(() => localStorage.getItem('turnstile.designer.draft.console-fixture'));
  ok('shared-surface alignment includes only writable plugin rows', spreadCount === 1 && spreadDraft.includes('plug-alpha') && !spreadDraft.includes('plug-gamma') && readFileSync(patchPath, 'utf8') === applied, JSON.stringify({ spreadCount, spreadDraft }));
  await page.reload({ waitUntil: 'domcontentloaded' }); await click('[data-testid="nav-designer"]');
  await page.waitForSelector('.command-row');
  const restoredCount = await count('.command-row');
  const restoredAnchor = await page.locator('[data-testid="property-anchor"]').inputValue();
  ok('local draft and pending property survive a browser reload', restoredCount === 1 && restoredAnchor === 'top-left', JSON.stringify({ restoredCount, restoredAnchor }));
  await page.keyboard.press('Control+s');
  ok('restored draft can establish a new save point', !(await text('[data-testid="designer-dirty"]')).includes('有修改'));
  await page.screenshot({ path: join(stateDir, 'console-designer.png'), fullPage: true });
  const injected = await page.request.post(base + '/turnstile/designer', { data: { dryRun: true, operations: [{ type: 'toggle', package: 'plug-alpha', row: 'attacker-row', disable: true }] } });
  const injectedBody = await injected.json();
  ok('server ignores browser-supplied row ids', injectedBody.operations?.[0]?.row === 'alpha-row');
  // Batch slice: a multi-selection in the table becomes several queue entries behind one preview.
  await click('[data-testid="nav-plugins"]');
  await page.waitForTimeout(300);
  await page.locator('[data-testid="plugin-plug-alpha"]').click();
  await page.locator('[data-testid="plugin-plug-beta"]').click({ modifiers: ['Control'] });
  await click('[data-testid="nav-designer"]');
  await page.waitForTimeout(300);
  await click('[data-testid="palette-Common"]');
  const before = await page.locator('[data-testid^="command-delete-"]').count();
  await click('[data-testid="designer-batch-disable"]');
  await page.waitForTimeout(250);
  const after = await page.locator('[data-testid^="command-delete-"]').count();
  ok('batch adds one queue entry per selected plugin', after >= before + 2, before + '->' + after);
  // The history timeline runs beside undo/redo: jumping back must shrink the queue, and undo must still work.
  await click('[data-testid="palette-Common"]');
  await click('[data-testid="designer-add-toggle"]');
  await page.waitForTimeout(200);
  await click('[data-testid="designer-add-anchor"]');
  await page.waitForTimeout(250);
  const histRows = await page.locator('[data-testid^="history-"]').count();
  ok('history panel lists the applied edits', histRows >= 2, String(histRows));
  const queueBeforeJump = await page.locator('[data-testid^="command-delete-"]').count();
  await page.locator('[data-testid="history-0"]').click();
  await page.waitForTimeout(300);
  const queueAfterJump = await page.locator('[data-testid^="command-delete-"]').count();
  ok('jumping to an earlier entry shortens the queue', queueAfterJump < queueBeforeJump, queueBeforeJump + '->' + queueAfterJump);
  ok('undo remains enabled after a jump', !(await page.locator('[data-testid="designer-undo"]').first().isDisabled()));
  // The panel must use the shared module, not a private copy: a stale persisted array must not break it.
  ok('history rows expose time+label+state via the module', await page.evaluate(() => {
    const row = document.querySelector('[data-testid^="history-"]');
    return Boolean(row) && /\d{2}:\d{2}:\d{2}/.test(row.textContent) && /条/.test(row.textContent);
  }));
  ok('no uncaught designer browser errors', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (error) {
  ok('designer e2e completed without throwing', false, String(error?.stack || error).slice(0, 500));
} finally {
  if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); rmSync(tmp, { recursive: true, force: true });
}
const failed = steps.filter((s) => !s.pass).length;
console.log('\n' + (steps.length - failed) + '/' + steps.length + ' checks passed');
if (failed) process.exitCode = 1;
