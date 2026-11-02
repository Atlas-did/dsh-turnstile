#!/usr/bin/env node
// Browser-level review annotation test: real mouse, reload persistence and downloads.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('needs playwright-core and a system Edge/Chrome');
  process.exit(3);
}
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { copyTreeSafe } from './safe-copy.mjs';
import { createConsoleServer } from './console-server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'state');
mkdirSync(output, { recursive: true });
const tmp = mkdtempSync(join(output, '.annotations-e2e-'));
const profileDir = join(tmp, 'profile');
copyTreeSafe(join(root, 'tests', 'console-fixture'), profileDir);
const steps = [], errors = [];
let browser, server;
const ok = (name, pass, detail = '') => { steps.push({ name, pass }); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : '')); };

try {
  server = createConsoleServer({ profileDir, stateDir: join(tmp, 'state'), fixture: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); break; } catch {}
  }
  if (!browser) browser = await chromium.launch({ headless: true }).catch(() => null);
  if (!browser) { console.log('SKIP: no browser'); process.exitCode = 3; }
  else {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.setExtraHTTPHeaders({ 'x-turnstile-token': server.turnstileToken });
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent === '数据已读取');
    await page.locator('[data-testid="annotations-toggle"]').click();
    ok('annotation sidebar opens', await page.locator('[data-testid="annotations-drawer"]').isVisible());
    ok('empty state explains both entry points', (await page.locator('[data-testid="annotation-empty"]').innerText()).includes('选中页面文字'));
    await page.locator('[data-testid="annotation-new"]').click();
    await page.locator('[data-testid="annotation-kind"]').selectOption('issue');
    await page.locator('[data-testid="annotation-text"]').fill('总览这里的证据来源需要写清楚。');
    await page.locator('[data-testid="annotation-save"]').click();
    ok('new note appears in the open list', (await page.locator('.annotation-card').count()) === 1 && (await page.locator('.annotation-card').innerText()).includes('证据来源'));
    ok('toolbar counts unresolved notes', (await page.locator('[data-testid="annotation-count"]').innerText()) === '1');
    await page.locator('[data-testid="annotations-close"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent === '数据已读取');
    await page.locator('[data-testid="annotations-toggle"]').click();
    ok('note survives a full page reload', (await page.locator('.annotation-card').innerText()).includes('证据来源'));
    await page.getByRole('button', { name: '标为已解决', exact: true }).click();
    ok('resolving removes the note from the open filter', (await page.locator('.annotation-card').count()) === 0 && (await page.locator('[data-testid="annotation-empty"]').isVisible()));
    await page.locator('[data-testid="annotation-filter"]').selectOption('all');
    ok('all filter retains resolved history', (await page.locator('.annotation-card').innerText()).includes('已解决'));
    await page.getByRole('button', { name: '重新打开', exact: true }).click();
    ok('resolved note can be reopened', (await page.locator('.annotation-card').innerText()).includes('待处理'));
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-testid="annotations-export"]').click();
    const download = await downloadEvent;
    const markdown = readFileSync(await download.path(), 'utf8');
    ok('Markdown export contains actionable context', markdown.includes('控制台总览') && markdown.includes('证据来源') && download.suggestedFilename().endsWith('.md'));
    await page.locator('.annotation-card').getByRole('button', { name: '删除', exact: true }).click();
    ok('delete requires a second explicit click', (await page.locator('.annotation-card').count()) === 1 && (await page.locator('.annotation-card').innerText()).includes('确认删除'));
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    ok('confirmed delete removes the note', (await page.locator('.annotation-card').count()) === 0);
    await page.locator('[data-testid="annotations-close"]').click();

    await page.locator('[data-testid="nav-plugins"]').click();
    await page.locator('[data-testid="plugin-plug-alpha"]').click();
    await page.keyboard.press('Control+Shift+A');
    ok('keyboard shortcut opens annotations', await page.locator('[data-testid="annotations-drawer"]').isVisible());
    await page.locator('[data-testid="annotation-new"]').click();
    ok('new note binds the selected plugin', (await page.locator('.annotation-context').innerText()).includes('plug-alpha'));
    await page.locator('[data-testid="annotation-text"]').fill('核对 plug-alpha 的配置来源。');
    await page.locator('[data-testid="annotation-save"]').click();
    await page.locator('[data-testid^="annotation-locate-"]').click();
    ok('locate returns to the annotated architecture object', (await page.locator('.arch-current').innerText()).includes('plug-alpha') && !(await page.locator('[data-testid="annotations-drawer"]').isVisible()));

    await page.locator('[data-testid="nav-plugins"]').click();
    await page.locator('.page-head p').evaluate((el) => {
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.waitForSelector('[data-testid="annotation-selection"]:visible');
    await page.locator('[data-testid="annotation-selection"]').click();
    ok('text selection carries a verbatim quote', (await page.locator('[data-testid="annotation-quote"]').innerText()).includes('点击表头排序'));
    await page.locator('[data-testid="annotation-text"]').fill('这段说明可以补充快捷键。');
    await page.locator('[data-testid="annotation-save"]').click();
    ok('quoted note renders its source excerpt', (await page.locator('[data-testid="annotation-list"]').innerText()).includes('点击表头排序'));

    // ── 点选元素 / 草稿保护 / 编号标记（批注最小方案 A–C） ──
    await page.setViewportSize({ width: 1440, height: 960 });
    const drawerOpen = async () => page.locator('[data-testid="annotations-drawer"]').isVisible();
    const openDrawer = async () => { if (!(await drawerOpen())) { await page.locator('[data-testid="annotations-toggle"]').click(); await page.waitForTimeout(250); } };
    await openDrawer();
    await page.locator('[data-testid="annotation-new"]').click();
    await page.locator('[data-testid="annotation-text"]').fill('草稿不应该丢。');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await openDrawer();
    const restored = await page.locator('[data-testid="annotation-text"]').inputValue().catch(() => '');
    ok('draft survives closing the sidebar', restored === '草稿不应该丢。', restored);

    await page.locator('[data-testid="annotation-pick"]').click();
    await page.waitForTimeout(250);
    ok('picking collapses the sidebar', !(await page.locator('[data-testid="annotations-drawer"]').isVisible()));
    const targetBox = await page.locator('#connection, .statusbar').first().boundingBox();
    if (targetBox) await page.mouse.click(targetBox.x + 6, targetBox.y + targetBox.height / 2);
    await page.waitForTimeout(350);
    ok('picking reopens the sidebar with the draft', await page.locator('[data-testid="annotations-drawer"]').isVisible());
    const ctxText = await page.locator('[data-testid="annotation-context"]').innerText().catch(() => '');
    ok('picked element context is shown', Boolean(ctxText.trim()), ctxText.slice(0, 40));
    await page.locator('[data-testid="annotation-text"]').fill('这个状态栏元素需要确认。');
    await page.locator('[data-testid="annotation-save"]').click();
    await page.waitForTimeout(400);
    const caps = await page.locator('[data-testid^="annotation-capture-"]').count();
    ok('capture status is recorded (unavailable here)', caps >= 1, String(caps));
    const badges = await page.locator('[data-testid^="annotation-badge-"]').count();
    ok('numbered badge appears next to the picked element', badges >= 1, String(badges));
    if (badges) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      await page.locator('[data-testid^="annotation-badge-"]').first().click();
      await page.waitForTimeout(300);
      ok('badge opens the sidebar again', await page.locator('[data-testid="annotations-drawer"]').isVisible());
    }
    await page.screenshot({ path: join(output, 'console-annotations.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 760 });
    const bounds = await page.locator('[data-testid="annotations-drawer"]').boundingBox();
    ok('narrow screen keeps the annotation drawer usable', bounds.x >= 0 && bounds.width <= 390 && bounds.height > 500, JSON.stringify(bounds));
    await page.keyboard.press('Escape');
    ok('Escape closes the annotation sidebar', !(await page.locator('[data-testid="annotations-drawer"]').isVisible()));
    ok('annotation flow produces no browser errors', errors.length === 0, errors.join(' | '));
  }
} catch (e) {
  ok('annotation e2e completes without throwing', false, String(e?.message || e).slice(0, 240));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
}
const failed = steps.filter((s) => !s.pass).length;
console.log('\n' + (steps.length - failed) + '/' + steps.length + ' annotation checks passed');
if (failed) process.exitCode = 1;
