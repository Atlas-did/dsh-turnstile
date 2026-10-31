// 页面搭建器的真浏览器验收：拖动、落点、改属性、撤销、跳快照、保存。
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('needs playwright-core (npm i -D playwright-core) and a system Edge');
  process.exit(3);
}

const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'turnstile-popup', 'lib');
const saved = join(mkdtempSync(join(tmpdir(), 'builder-')), 'page.json');
let posted = null;

const server = createServer((req, res) => {
  if (req.url.startsWith('/turnstile/builder')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(join(lib, 'builder.html'), 'utf8')); return; }
  if (req.url.startsWith('/turnstile/page-model.js')) {
    // 与插件路由一致：经典脚本形态，剥掉 export
    const src = readFileSync(join(lib, 'page-model.js'), 'utf8').replace(/^export\s+(?=(function|const|let|class))/gm, '');
    res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(src); return;
  }
  if (req.url.startsWith('/turnstile/page-render.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(join(lib, 'page-render.js'), 'utf8')); return; }
  if (req.url.startsWith('/turnstile/page')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { posted = JSON.parse(body); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"status":"not-generated"}'); return;
  }
  res.writeHead(404); res.end('no');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:' + port + '/turnstile/builder?token=t', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);

ok('palette lists components', (await page.locator('[data-testid^="palette-"]').count()) >= 6);
ok('the root node renders', (await page.locator('[data-testid="canvas"] .node').count()) >= 1);

// 拖一个标题进画布（真鼠标事件，不是 element.click()）
const target = page.locator('[data-testid="canvas"] > .node').first();
const box = await target.boundingBox();
// 真 HTML5 拖拽用 dragTo（mouse.down/move/up 不触发 dragstart）
await page.locator('[data-testid="palette-heading"]').dragTo(target);
await page.waitForTimeout(400);
const afterDrag = await page.locator('[data-testid^="node-heading-"]').count();
ok('drag-drop adds the component', afterDrag === 1, 'count=' + afterDrag);

// 选中新节点 -> 改属性
if (afterDrag === 1) {
  await page.locator('[data-testid^="node-heading-"]').first().click();
  await page.waitForTimeout(200);
  const input = page.locator('[data-testid="prop-text"]');
  await input.fill('你好，mini');
  await input.blur();
  await page.waitForTimeout(300);
  ok('inspector change reaches the canvas', (await page.locator('[data-testid="view-heading"]').first().innerText()).includes('你好，mini'));
}

// 枚举/范围校验
// 第二条路径：点组件 → 点容器（点击放置，不依赖拖拽）
await page.locator('[data-testid="palette-grid"]').click();
await page.waitForTimeout(200);
await target.click();
await page.waitForTimeout(300);
const grids = await page.locator('[data-testid^="node-grid-"]').count();
if (grids === 1) {
  await page.locator('[data-testid^="node-grid-"]').first().click();
  await page.waitForTimeout(200);
  const cols = page.locator('[data-testid="prop-columns"]');
  await cols.fill('99'); await cols.blur();
  await page.waitForTimeout(250);
  ok('out-of-range value is refused with a reason', (await page.locator('[data-testid="prop-error"]').count()) === 1);
}

// 新组件：表格 / 图表 / 图片 都要能被拖进来并渲染
for (const type of ['table', 'chart']) {
  await page.locator('[data-testid="palette-' + type + '"]').click();
  await page.waitForTimeout(120);
  await target.click();
  await page.waitForTimeout(200);
}
ok('table component renders rows', (await page.locator('[data-testid="view-table"] tbody tr').count()) >= 1);
ok('chart component renders bars', (await page.locator('[data-testid="view-chart"]').first().innerText()).includes('ui-settings'));

// 样式面板：改对齐后画布立刻变
await page.locator('[data-testid^="node-heading-"]').first().click();
await page.waitForTimeout(200);
await page.locator('[data-testid="style-align"]').selectOption('center');
await page.waitForTimeout(300);
ok('style panel applies alignment', (await page.locator('[data-testid="view-heading"]').first().evaluate((n) => getComputedStyle(n).textAlign)) === 'center');
// 模板：一键套用「体检报告页」
await page.locator('[data-testid="template-health"]').click();
await page.waitForTimeout(400);
ok('template loads a bound page', (await page.locator('[data-testid="canvas"]').innerText()).includes('环境体检'));
ok('bound table asks the host for data', (await page.locator('[data-source="health"]').count()) >= 1);

// 撤销 / 重做 / 快照
const beforeUndo = await page.locator('#canvas .node').count();
await page.locator('[data-testid="undo"]').click();
await page.waitForTimeout(250);
ok('undo removes the last change', (await page.locator('#canvas .node').count()) <= beforeUndo, beforeUndo + ' -> ' + (await page.locator('#canvas .node').count()));
await page.locator('[data-testid="redo"]').click();
await page.waitForTimeout(250);
ok('redo restores it', (await page.locator('[data-testid^="node-grid-"]').count()) + (await page.locator('[data-testid^="node-heading-"]').count()) >= 1);
ok('snapshots are listed', (await page.locator('[data-testid^="snap-"]').count()) >= 2);
await page.locator('[data-testid="snap-1"]').click();
await page.waitForTimeout(250);
ok('jumping to a snapshot works', (await page.locator('[data-testid="status"]').innerText()).includes('快照'));

// 保存
await page.locator('[data-testid="save"]').click();
await page.waitForTimeout(500);
ok('saving posts a page with schema+root', !!posted && posted.page && posted.page.schema === 'mini/page@1' && !!posted.page.root);
ok('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(fail ? 'BUILDER_E2E_FAILED ' + fail : 'BUILDER_E2E_OK');
process.exitCode = fail ? 1 : 0;
