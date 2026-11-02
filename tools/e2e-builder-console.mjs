// 独立控制台里的完整创作路径：入口 → 编辑 → 保存 → 刷新恢复 → 导出 → 预览。
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('needs playwright-core and a system Edge');
  process.exit(3);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const state = mkdtempSync(join(tmpdir(), 'turnstile-builder-console-'));
const server = createConsoleServer({ profileDir: join(root, 'tests', 'console-fixture'), stateDir: state, fixture: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
let fail = 0;
const ok = (name, condition, detail = '') => {
  console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : ''));
  if (!condition) fail++;
};
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ 'x-turnstile-token': server.turnstileToken });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="new-page"]').waitFor();
  ok('控制台提供新建页面入口', await page.locator('[data-testid="new-page"]').isVisible());
  await page.locator('[data-testid="new-page"]').click();
  await page.locator('[data-testid="canvas"]').waitFor();

  await page.locator('[data-testid="palette-heading"]').click();
  await page.locator('#canvas > .node').first().click();
  await page.locator('[data-testid^="node-heading-"]').first().click();
  await page.locator('[data-testid="prop-text"]').fill('闭环验收页面');
  await page.locator('[data-testid="prop-text"]').blur();
  await page.locator('[data-testid="export-name"]').fill('acceptance-page');
  await page.locator('[data-testid="save"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent.includes('已保存'));
  ok('真实独立服务保存页面', existsSync(join(state, 'page-console.json')));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent.includes('已恢复'));
  ok('刷新后恢复保存内容', (await page.locator('[data-testid="canvas"]').innerText()).includes('闭环验收页面'));

  await page.locator('[data-testid="export"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent.includes('尚未试装真实 mini'));
  const out = join(state, 'exports', 'acceptance-page');
  const exportStatus = await page.locator('[data-testid="status"]').innerText();
  ok('界面展示隔离模块自检通过', exportStatus.includes('导出与隔离模块自检通过'));
  const exported = existsSync(join(out, 'lib', 'index.js')) && existsSync(join(out, 'lib', 'page-render.js'));
  ok('导出由真实服务写入隔离 state', exported, exportStatus + ' | expected=' + out);
  if (exported) {
    const exportedPage = JSON.parse(readFileSync(join(out, 'lib', 'page.json'), 'utf8'));
    ok('导出内容就是当前画布', exportedPage.root.children.some((n) => n.props?.text === '闭环验收页面'));
  } else ok('导出内容就是当前画布', false);
  await page.screenshot({ path: join(root, '..', 'builder-closed-loop.png'), fullPage: true });

  const previewPromise = context.waitForEvent('page');
  await page.locator('[data-testid="preview"]').click();
  const preview = await previewPromise;
  await preview.waitForLoadState('domcontentloaded');
  await preview.locator('text=闭环验收页面').waitFor();
  ok('预览路由渲染同一页面', (await preview.locator('body').innerText()).includes('闭环验收页面'));
  ok('没有浏览器脚本错误', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(fail ? 'BUILDER_CONSOLE_E2E_FAILED ' + fail : 'BUILDER_CONSOLE_E2E_OK');
process.exitCode = fail ? 1 : 0;
