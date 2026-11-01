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
let savedPage = null;
let exported = null;

const server = createServer((req, res) => {
  if (req.url.startsWith('/turnstile/builder')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(join(lib, 'builder.html'), 'utf8')); return; }
  if (req.url.startsWith('/turnstile/page-model.js')) {
    // 与插件路由一致：经典脚本形态，剥掉 export
    const src = readFileSync(join(lib, 'page-model.js'), 'utf8').replace(/^export\s+(?=(function|const|let|class))/gm, '');
    res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(src); return;
  }
  if (req.url.startsWith('/turnstile/page-render.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(join(lib, 'page-render.js'), 'utf8')); return; }
  if (req.url.startsWith('/turnstile/history-timeline.js') || req.url.startsWith('/turnstile/selection.js')) {
    const name = req.url.startsWith('/turnstile/selection.js') ? 'selection.js' : 'history-timeline.js';
    const src = readFileSync(join(lib, name), 'utf8').replace(/\bexport\s+(function|const|class)/g, '$1');
    res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(src); return;
  }
  if (req.url.startsWith('/turnstile/export')) {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      exported = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: exported.name, route: '/' + exported.name, outDir: saved + '-export' }));
    });
    return;
  }
  if (req.url.startsWith('/turnstile/page')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { posted = JSON.parse(body); savedPage = posted.page; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(savedPage || { status: 'not-generated' })); return;
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
// 饼图与折线（SVG）
await page.locator('[data-testid="palette-chart"]').click();
await page.locator('#canvas > .node').first().click();
await page.waitForTimeout(250);
await page.locator('[data-testid="prop-kind"]').selectOption('pie');
await page.waitForTimeout(300);
ok('pie renders svg slices', (await page.locator('svg path').count()) >= 3);
await page.locator('[data-testid="prop-kind"]').selectOption('line');
await page.waitForTimeout(300);
ok('line renders an axis polyline', (await page.locator('svg polyline').count()) >= 1);

// 样式自由值：颜色/字号
await page.locator('[data-testid^="node-heading-"]').first().click();
await page.waitForTimeout(200);
await page.locator('[data-testid="style-color"]').fill('#ff0000');
await page.locator('[data-testid="style-color"]').blur();
await page.waitForTimeout(300);
ok('free colour applies', (await page.locator('[data-testid="view-heading"]').first().evaluate((n) => getComputedStyle(n).color)).includes('255, 0, 0'));

// 模板：一键套用「体检报告页」
await page.locator('[data-testid="template-health"]').click();
await page.waitForTimeout(400);
ok('template loads a bound page', (await page.locator('[data-testid="canvas"]').innerText()).includes('环境体检'));
ok('bound table asks the host for data', (await page.locator('[data-source="health"]').count()) >= 1);

// 模板是新的编辑基线；随后做一次真实新增，再验证撤销 / 重做 / 快照。
ok('template starts a new undo baseline', await page.locator('[data-testid="undo"]').isDisabled());
await page.locator('[data-testid="palette-text"]').click();
await target.click();
await page.waitForTimeout(250);
const beforeUndo = await page.locator('#canvas .node').count();
await page.locator('[data-testid="undo"]').click();
await page.waitForTimeout(250);
ok('undo removes the last change', (await page.locator('#canvas .node').count()) < beforeUndo, beforeUndo + ' -> ' + (await page.locator('#canvas .node').count()));
await page.locator('[data-testid="redo"]').click();
await page.waitForTimeout(250);
ok('redo restores it', (await page.locator('[data-testid="view-text"]').count()) === 1);
ok('snapshots are listed', (await page.locator('[data-testid^="snap-"]').count()) >= 2);
await page.locator('[data-testid="snap-1"]').click();
await page.waitForTimeout(250);
ok('jumping to a snapshot works', (await page.locator('[data-testid="status"]').innerText()).includes('快照'));

// 编辑历史：任意跳转、撤销/重做共存，以及回退后的新编辑截断旧未来。
await page.locator('[data-testid="palette-text"]').click();
await target.click();
await page.waitForTimeout(250);
ok('builder history records a committed edit', (await page.locator('[data-testid^="builder-history-"]').count()) >= 2);
const historyLabel = await page.locator('[data-testid="builder-history-1"]').innerText();
ok('builder history shows time and a human label', /\d{2}:\d{2}:\d{2}/.test(historyLabel) && historyLabel.includes('添加文本'), historyLabel);
await page.locator('[data-testid^="node-text-"]').first().click();
const historyText = page.locator('[data-testid="prop-text"]');
await historyText.fill('历史前'); await historyText.blur();
await page.waitForTimeout(150);
await page.locator('[data-testid="prop-text"]').fill('历史后');
await page.locator('[data-testid="prop-text"]').blur();
await page.waitForTimeout(250);
ok('builder history records successive property edits', (await page.locator('[data-testid^="builder-history-"]').count()) === 4);
await page.locator('[data-testid="builder-history-1"]').click();
await page.waitForTimeout(250);
ok('clicking an earlier history step restores the canvas', (await page.locator('[data-testid="view-text"]').innerText()) === '一段说明');
ok('undo remains available after a history jump', !(await page.locator('[data-testid="undo"]').isDisabled()));
await page.locator('[data-testid="undo"]').click();
await page.waitForTimeout(200);
ok('undo follows the timeline backwards', (await page.locator('[data-testid="view-text"]').count()) === 0);
await page.locator('[data-testid="redo"]').click();
await page.waitForTimeout(200);
ok('redo follows the timeline forwards', (await page.locator('[data-testid="view-text"]').innerText()) === '一段说明');
await page.locator('[data-testid^="node-text-"]').first().click();
await page.locator('[data-testid="prop-text"]').fill('分支编辑');
await page.locator('[data-testid="prop-text"]').blur();
await page.waitForTimeout(250);
ok('a new edit after jumping truncates the old future', (await page.locator('[data-testid^="builder-history-"]').count()) === 3);
ok('the abandoned future is no longer listed', !(await page.locator('[data-testid="builder-history"]').innerText()).includes('历史后'));
ok('the new branch is rendered on the canvas', (await page.locator('[data-testid="view-text"]').innerText()) === '分支编辑');

// Ctrl 多选：共同属性显示混合值，一次批量修改只产生一个历史步骤。
await page.locator('[data-testid^="node-heading-"]').first().click();
await page.locator('[data-testid^="node-text-"]').first().click({ modifiers: ['Control'] });
await page.waitForTimeout(250);
ok('ctrl-click opens the multi-node inspector', (await page.locator('[data-testid="multi-inspector"]').innerText()).includes('已选 2 个节点'));
ok('both selected nodes are visibly highlighted', (await page.locator('#canvas .node.sel').count()) === 2);
ok('different values are explicitly marked as mixed', (await page.locator('[data-testid="batch-prop-text"]').getAttribute('placeholder')) === '多个值');
await page.locator('[data-testid="batch-prop-text"]').fill('统一文字');
await page.locator('[data-testid="batch-prop-text"]').blur();
await page.waitForTimeout(250);
ok('one batch property edit updates every selected node', (await page.locator('[data-testid="view-heading"]').innerText()) === '统一文字' && (await page.locator('[data-testid="view-text"]').innerText()) === '统一文字');
ok('one batch property edit creates exactly one history step', (await page.locator('[data-testid^="builder-history-"]').count()) === 4 && (await page.locator('[data-testid="builder-history"]').innerText()).includes('批量修改属性'));
await page.locator('[data-testid="undo"]').click();
await page.waitForTimeout(200);
ok('one undo restores every original value', (await page.locator('[data-testid="view-heading"]').innerText()) === '环境体检' && (await page.locator('[data-testid="view-text"]').innerText()) === '分支编辑');
await page.locator('[data-testid="redo"]').click();
await page.waitForTimeout(200);
ok('one redo reapplies every batch value', (await page.locator('[data-testid="view-heading"]').innerText()) === '统一文字' && (await page.locator('[data-testid="view-text"]').innerText()) === '统一文字');
await page.locator('[data-testid="batch-style-align"]').selectOption('center');
await page.waitForTimeout(250);
ok('batch style edit reaches every selected renderer', await page.locator('[data-testid="view-heading"], [data-testid="view-text"]').evaluateAll((els) => els.every((el) => getComputedStyle(el).textAlign === 'center')));
ok('batch style edit adds only one more history step', (await page.locator('[data-testid^="builder-history-"]').count()) === 5);
await page.locator('[data-testid^="node-heading-"]').first().click();
await page.locator('[data-testid^="node-text-"]').first().click({ modifiers: ['Shift'] });
await page.waitForTimeout(200);
ok('shift-click selects the node range', (await page.locator('[data-testid="multi-inspector"]').innerText()).includes('已选 2 个节点'));

// 保存 → 真刷新 → 恢复同一页面，而不是每次打开都丢成空画布。
await page.locator('[data-testid="save"]').click();
await page.waitForTimeout(500);
ok('saving posts a page with schema+root', !!posted && posted.page && posted.page.schema === 'mini/page@1' && !!posted.page.root);
const savedText = await page.locator('[data-testid="canvas"]').innerText();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
ok('reload restores the saved page', (await page.locator('[data-testid="canvas"]').innerText()) === savedText && (await page.locator('[data-testid="status"]').innerText()).includes('已恢复'));
ok('reload starts history from one saved-page baseline', (await page.locator('[data-testid^="builder-history-"]').count()) === 1 && (await page.locator('[data-testid="builder-history-0"]').innerText()).includes('已保存页面'));

// 大纲与画布共用选择模型；折叠是纯视图状态，不产生编辑历史。
const outlineRows = page.locator('[data-testid="outline-select"]');
ok('outline mirrors the full canvas hierarchy', await outlineRows.count() === await page.locator('#canvas .node').count() && await outlineRows.count() >= 3);
const textId = await page.locator('[data-testid^="node-text-"]').first().getAttribute('data-node-id');
const headingId = await page.locator('[data-testid^="node-heading-"]').first().getAttribute('data-node-id');
const rootId = await page.locator('#canvas > .node').first().getAttribute('data-node-id');
const outlineFor = (id) => page.locator('[data-testid="outline-select"][data-node-id="' + id + '"]');
await outlineFor(textId).click();
await page.waitForTimeout(150);
ok('outline selection highlights the same canvas node', await outlineFor(textId).getAttribute('aria-selected') === 'true' && await page.locator('#canvas .node.sel').getAttribute('data-node-id') === textId);
await outlineFor(headingId).click({ modifiers: ['Control'] });
await page.waitForTimeout(150);
ok('outline ctrl-click shares canvas multi-selection', await page.locator('[data-testid="outline-select"].active').count() === 2 && await page.locator('#canvas .node.sel').count() === 2);
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
ok('multi-node delete is refused without changing history', await page.locator('#canvas .node.sel').count() === 2 && await page.locator('[data-testid^="builder-history-"]').count() === 1 && (await page.locator('[data-testid="status"]').innerText()).includes('多选删除'));
const rootToggle = page.locator('[data-testid="outline-toggle"][data-node-id="' + rootId + '"]');
await rootToggle.click();
await page.waitForTimeout(100);
ok('outline collapse hides children but preserves history', await outlineRows.count() === 1 && await rootToggle.getAttribute('aria-label') === '展开stack' && await page.locator('[data-testid^="builder-history-"]').count() === 1);
await rootToggle.click();
await page.waitForTimeout(100);
ok('outline expand restores all rows', await outlineRows.count() === await page.locator('#canvas .node').count());

// Enter／Space 选择，方向键按深度优先顺序移动；DOM 重建后仍保留键盘焦点。
const rootOutline = outlineFor(rootId);
await rootOutline.focus(); await page.keyboard.press('Enter');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
const belowRoot = await page.locator('[data-testid="outline-select"].active').getAttribute('data-node-id');
ok('arrow-down moves from root to its first child', belowRoot === headingId, belowRoot);
await page.keyboard.press('ArrowUp');
ok('arrow-up returns to the root and restores focus', await rootOutline.getAttribute('aria-selected') === 'true' && await rootOutline.evaluate((el) => el === document.activeElement));
await outlineFor(textId).focus(); await page.keyboard.press('Space');
await page.waitForTimeout(100);
ok('space selects a focused outline row', await outlineFor(textId).getAttribute('aria-selected') === 'true' && await page.locator('#canvas .node.sel').getAttribute('data-node-id') === textId);

// Delete／撤销／重做／保存全部走现有模型和 HTTP 路由。
await rootOutline.click();
await page.locator('[data-testid="palette-stat"]').click();
await target.click();
await page.waitForTimeout(200);
ok('a stat can be added before keyboard deletion', await page.locator('[data-testid^="node-stat-"]').count() === 1);
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
ok('delete removes the focused node', await page.locator('[data-testid^="node-stat-"]').count() === 0);
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
ok('ctrl-z restores the deleted node', await page.locator('[data-testid^="node-stat-"]').count() === 1);
await page.keyboard.press('Control+y');
await page.waitForTimeout(150);
ok('ctrl-y reapplies the deletion', await page.locator('[data-testid^="node-stat-"]').count() === 0);
await outlineFor(headingId).click();
const protectedInput = page.locator('[data-testid="prop-text"]');
await protectedInput.focus();
await page.keyboard.press('Delete');
await page.waitForTimeout(100);
ok('delete inside an inspector input never removes a node', await page.locator('[data-testid^="node-heading-"]').count() === 1 && await page.locator('[data-testid^="builder-history-"]').count() === 3);
posted = null;
await page.keyboard.press('Control+s');
await page.waitForTimeout(400);
ok('ctrl-s performs a real page save even from an input', !!posted?.page?.root && (await page.locator('[data-testid="status"]').innerText()).includes('已保存'));

// 复制／粘贴保留内容但生成新 id；Alt+方向键修改真实层级和顺序，且每步可撤销。
await rootOutline.click();
await page.locator('[data-testid="palette-panel"]').click();
await target.click();
await page.waitForTimeout(200);
const panelId = await page.locator('#canvas .node.sel').getAttribute('data-node-id');
ok('a panel is available as a keyboard move target', panelId?.startsWith('panel-'));
await outlineFor(textId).click();
await page.keyboard.press('Control+c');
await page.waitForTimeout(100);
ok('copy stores a node without creating history', (await page.locator('[data-testid="status"]').innerText()).includes('已复制 text') && await page.locator('[data-testid^="builder-history-"]').count() === 4);
await rootOutline.click();
await page.keyboard.press('Control+v');
await page.waitForTimeout(200);
const pastedId = await page.locator('[data-testid^="node-text-"]').last().getAttribute('data-node-id');
ok('paste creates a distinct copy of the subtree', await page.locator('[data-testid^="node-text-"]').count() === 2 && pastedId !== textId);
ok('paste is one labelled history step', await page.locator('[data-testid^="builder-history-"]').count() === 5 && (await page.locator('[data-testid="builder-history"]').innerText()).includes('粘贴文本'));
const pastedNode = page.locator('[data-testid="node-' + pastedId + '"]');
const parentIdOf = () => pastedNode.evaluate((el) => el.parentElement?.parentElement?.getAttribute('data-node-id'));
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(150);
ok('alt-right moves the node into the previous container', await parentIdOf() === panelId);
await page.keyboard.press('Alt+ArrowLeft');
await page.waitForTimeout(150);
ok('alt-left moves the node back to the root', await parentIdOf() === rootId);
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
ok('one undo restores the previous hierarchy', await parentIdOf() === panelId);
await page.keyboard.press('Control+y');
await page.waitForTimeout(150);
ok('one redo reapplies the hierarchy move', await parentIdOf() === rootId);
const rootChildIds = () => page.locator('#canvas > .node > .stack-column > .node').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')));
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(150);
let orderedIds = await rootChildIds();
ok('alt-up reorders within the same parent', orderedIds.indexOf(pastedId) === orderedIds.indexOf(panelId) - 1, orderedIds.join(','));
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(150);
orderedIds = await rootChildIds();
ok('alt-down restores the following sibling order', orderedIds.indexOf(pastedId) === orderedIds.indexOf(panelId) + 1, orderedIds.join(','));
posted = null;
await page.keyboard.press('Control+s');
await page.waitForTimeout(400);
ok('saving includes pasted content and keyboard structure edits', JSON.stringify(posted?.page).includes(pastedId) && JSON.stringify(posted?.page).includes(panelId));
ok('preview opens the host page route', (await page.locator('[data-testid="preview"]').getAttribute('href')).startsWith('/turnstile/view'));

// 导出的是当前画布，不是另一份旧数据。
await page.locator('[data-testid="export-name"]').fill('restored-page');
await page.locator('[data-testid="export"]').click();
await page.waitForTimeout(500);
ok('export posts the requested plugin name', exported?.name === 'restored-page');
ok('export posts the restored page unchanged', JSON.stringify(exported?.page) === JSON.stringify(savedPage));
ok('export reports output and future route', (await page.locator('[data-testid="status"]').innerText()).includes('/restored-page'));
ok('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(fail ? 'BUILDER_E2E_FAILED ' + fail : 'BUILDER_E2E_OK');
process.exitCode = fail ? 1 : 0;
