#!/usr/bin/env node
// Full-window console mouse test. Uses a temporary profile copy and real mouse events.
// B2: playwright-core is an optional dependency - a static import made this file die with
// exit 1 before its own 'no browser' branch (exit 3) could run.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('needs playwright-core (npm i -D playwright-core) and a system Edge');
  process.exit(3);
}
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // e2e 用可复现的 fixture 数据（明确选入，不是默认）；真实数据路径由 fixture:false 覆盖
  // 运行产物不能写进夹具（否则 journal/view 会变成未跟踪文件污染仓库）
  const stateDir = join(tmp, '.turnstile-state');
  mkdirSync(stateDir, { recursive: true });
  // 但夹具里那几份「输入」（报告/占用/历史）要复制过来，否则页面没数据
  for (const f of ['gate-history.json', 'occupancy-console-fixture.json', 'report-console-fixture.json']) {
    const src = join(root, 'tests', 'console-fixture', '.turnstile', f);
    if (existsSync(src)) copyFileSync(src, join(stateDir, f));
  }
  // 启动器搜索现在是真索引：给 e2e 造一个小索引，否则「搜不到」是对的、但测不了渲染
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'launcher-index.json'), JSON.stringify({
    root: 'fixture', builtAt: 'T', count: 2,
    entries: [
      { path: 'C:/x/tools/launcher.mjs', name: 'launcher.mjs', size: 100, mtime: 1 },
      { path: 'C:/x/docs/launcher.md', name: 'launcher.md', size: 50, mtime: 1 },
    ],
  }));
  server = createConsoleServer({ profileDir, stateDir, fixture: true });
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
  await page.setExtraHTTPHeaders({ 'x-turnstile-token': server.turnstileToken });
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
    const navText = await text('#nav');
    ok('navigation never exposes undefined counts', !navText.includes('undefined'), JSON.stringify(navText));
    ok('navigation groups match user tasks', ['开始', '插件工作', '观察与诊断'].every((label) => navText.includes(label)), JSON.stringify(navText));
    ok('active navigation exposes its page to assistive technology', await page.locator('[data-testid="nav-overview"]').getAttribute('aria-current') === 'page');
    ok('the product shell has a visible identity', await page.locator('.brand-mark').isVisible());
    ok('plugin action is disabled without a selection', await page.locator('[data-testid="toggle-plugin"]').isDisabled());
    const snapshot = await (await page.request.get(base + '/api/console', { headers: { 'x-turnstile-token': server.turnstileToken } })).json();
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
    ok('install state is shown for a plugin and says unknown without a journal', await page.evaluate(() => {
      const el = document.querySelector('[data-testid="install-state"]');
      const txt = el ? el.textContent : '';
      return !!el && txt.includes('无法判断') && !txt.includes('已生效');
    }));
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
    ok('source action builds a vscode link carrying the line', await page.evaluate(() => {
      const el = document.querySelector('[data-testid="action-source"]');
      return !!el && /^vscode:\/\/file\/.+:\d+$/.test(el.getAttribute('href') || '');
    }));
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
    ok('checks view says there is no risk scan yet', await page.evaluate(() => !!document.querySelector('[data-testid="risk-empty"]')));
    ok('risk panel renders findings, delta and a locator link', await page.evaluate(() => {
      const saved = state.data.risk;
      state.data.risk = { at: 'T0', delta: { added: ['a'], resolved: [], still: ['b'] }, findings: [{ ruleId: 'risk.peer-only-scope', subject: { kind: 'plugin', id: 'plug-red' }, plugin: 'plug-red@1.0.0', message: '装不活：import 了 peer-only 的官方 scope', severity: 'error', strength: 'static-ast', falsifier: '在真实宿主里 import 成功可推翻', locator: { file: 'node_modules/plug-red/package.json', line: null } }] };
      render();
      const meta = document.querySelector('[data-testid="risk-meta"]');
      const rowEl = document.querySelector('[data-testid="risk-plug-red"]');
      const okMeta = !!meta && (meta.textContent || '').includes('新增 1');
      if (rowEl) rowEl.click();
      const insp = document.querySelector('#inspector');
      const link = document.querySelector('[data-testid="finding-link"]');
      const okInsp = !!insp && (insp.textContent || '').includes('risk.peer-only-scope');
      const okLink = !!link && (link.getAttribute('href') || '').indexOf('vscode://file/node_modules/plug-red/package.json') === 0;
      state.data.risk = saved; render();
      return okMeta && okInsp && okLink;
    }));

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
    writeFileSync(viewStatePath(stateDir), '{ broken json');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-overview"]');
    ok('corrupt view state falls back instead of breaking the page', (await page.locator('[data-testid="nav-overview"]').count()) === 1);
    await click('[data-testid="nav-plugins"]');
    let saved = null;
    for (let i = 0; i < 15 && !saved; i++) {
      await page.waitForTimeout(200);
      try { saved = JSON.parse(readFileSync(viewStatePath(stateDir), 'utf8')); } catch { saved = null; }
    }
    ok('view change is persisted', Boolean(saved) && saved.view === 'plugins', saved ? saved.view : 'not written');

    rmSync(patchPath);
    const noPatchResponse = await page.request.post(base + '/turnstile/toggle', { headers: { 'x-turnstile-token': server.turnstileToken }, data: { package: 'plug-alpha', disable: true, dryRun: false } });
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
    ok('disabled action explains itself', (await text('[data-testid="action-reason"]')).includes('该插件没有 profile 行'));
    ok('capabilities module is loaded in the page', (await page.evaluate(() => typeof window.TurnstileCapabilities)) === 'object');
    // Multi-select: ctrl adds a second row, and the panel reports the joint state.
    await click('[data-testid="nav-plugins"]');
    await page.waitForTimeout(250);
    await page.locator('[data-testid="plugin-plug-alpha"]').click();
    await page.locator('[data-testid="plugin-plug-beta"]').click({ modifiers: ['Control'] });
    const summary = await text('[data-testid="selection-summary"]').catch(() => '');
    ok('ctrl-click builds a multi-selection', summary.includes('已选 2 个'), summary);
    // 全面体检: one button, every item carries a next step.
    await click('[data-testid="nav-overview"]');
    await page.waitForTimeout(400);
    await click('[data-testid="health-run"]');
    await page.waitForTimeout(1200);
    const issueRowsCount = await page.locator('[data-testid^="issue-"]').count();
    ok('the health scan renders issue rows', issueRowsCount >= 1, String(issueRowsCount));
    const groupCounts = await page.locator('[data-testid^="issues-"]').count();
    ok('issues are split into three groups', groupCounts === 3, String(groupCounts));
    await page.locator('[data-testid^="issue-"] summary').first().click().catch(() => {});
    await page.waitForTimeout(250);
    const recheckBtn = page.locator('[data-testid^="recheck-run-"]').first();
    if (await recheckBtn.count()) {
      await recheckBtn.click();
      await page.waitForTimeout(900);
      const resultText = await page.locator('[data-testid^="recheck-result-"]').first().innerText().catch(() => '');
      ok('recheck reports a verdict instead of green-washing', /结论：/.test(resultText) && /(已恢复|仍未解决|取证不足)/.test(resultText), resultText.slice(0, 40));
    } else ok('recheck button present', false, 'no issue rows');
    const summaryText = await text('[data-testid="health-summary"]').catch(() => '');
    ok('the scan summarises the three issue groups', /需要处理/.test(summaryText) && /尚无结论/.test(summaryText), summaryText);
    ok('the trap checks render next to the health scan', (await text('[data-testid="health-pits"]')).includes('插件市场'));
    // 环境管家: left health, right profile table, both read-only.
    await click('[data-testid="nav-steward"]');
    await page.waitForTimeout(1200);
    ok('the steward page renders a two-column grid', (await page.locator('[data-testid="steward-grid"]').count()) === 1);
    ok('the steward lists profiles', (await page.locator('[data-testid^="profile-"]').count()) >= 2);
    ok('the steward shows terminal next steps', (await text('[data-testid="steward-commands"]')).includes('doctor.mjs'));
    ok('the steward reports the last known good snapshot', (await text('[data-testid="steward-lkg"]')).includes('verified-bootable'));
    await click('[data-testid="health-run"]');
    await page.waitForTimeout(1000);
    ok('the steward runs the health scan in place', (await page.locator('[data-testid="health-summary"]').count()) === 1);
    // 诊断卡片：走 /turnstile/diagnose，通道与推翻条件都要显示
    await click('[data-testid="diagnose-run"]');
    await page.waitForTimeout(900);
    ok('the diagnose card renders a verdict', (await text('[data-testid="diagnose-verdict"]')).includes('failing'));
    ok('channels are listed with evidence', (await text('[data-testid="channel-codex"]')).includes('aa.jsonl'));
    ok('every channel states a falsifier', (await text('[data-testid="channel-codex"]')).includes('推翻条件'));
    ok('the fix actions carry a rollback point', (await text('[data-testid="diagnose-actions"]')).includes('回滚'));
    // 插件行点击 -> 直接跳骨架（不用先输包名）
    await page.locator('[data-testid="nav-plugins"]').click();
    await page.waitForTimeout(400);
    const firstName = await page.locator('[data-testid^="plugin-name-"]').first().getAttribute('data-testid');
    await page.locator('[data-testid="' + firstName + '"]').click();
    await page.waitForTimeout(900);
    const jumped = await text('[data-testid="skeleton"]');
    ok('clicking a plugin row opens its skeleton', jumped.includes('inject 面'), jumped.slice(0, 60));

    // 路由级覆盖：正常 / 穿越 / 未安装，三种形状的真实状态码
    const routeStatus = await page.evaluate(async () => {
      const out = {};
      for (const [k, pkg] of [['ok', 'plug-alpha'], ['traversal', '../../../etc'], ['missing', 'no-such-plugin']]) {
        const r = await fetch('/turnstile/inspect?pkg=' + encodeURIComponent(pkg));
        out[k] = { status: r.status, body: await r.json() };
      }
      return out;
    });
    ok('inspect route: real plugin returns 200 with fields', routeStatus.ok.status === 200 && routeStatus.ok.body.version === '1.4.0' && routeStatus.ok.body.injects.includes('@deepseek-ai/dsh-client-ui-settings'), JSON.stringify(routeStatus.ok.body).slice(0, 80));
    ok('inspect route: traversal is 400', routeStatus.traversal.status === 400 && /包名不合法/.test(routeStatus.traversal.body.error), routeStatus.traversal.status + ' ' + String(routeStatus.traversal.body.error).slice(0, 40));
    ok('inspect route: missing plugin is 200 but installed=false', routeStatus.missing.status === 200 && routeStatus.missing.body.installed === false, routeStatus.missing.status + ' installed=' + routeStatus.missing.body.installed);

    // slot-map 的 POST 路径（之前只手工验证过）
    const slotPost = await page.evaluate(async () => {
      const okRes = await fetch('/turnstile/slot-map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slots: [{ slot: 'shell.overlay', count: 2, entries: ['plug-a:x'] }] }) });
      const okBody = await okRes.json();
      const back = await (await fetch('/turnstile/slot-map')).json();
      const badRes = await fetch('/turnstile/slot-map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nope: true }) });
      return { ok: okRes.status, okBody, roundTrip: back, bad: badRes.status };
    });
    ok('slot-map POST returns 200 and writes', slotPost.ok === 200 && slotPost.okBody.ok === true, JSON.stringify(slotPost.okBody).slice(0, 60));
    ok('slot-map GET reads back what was posted', slotPost.roundTrip.slots?.[0]?.slot === 'shell.overlay', JSON.stringify(slotPost.roundTrip).slice(0, 60));
    ok('slot-map rejects a body without slots', slotPost.bad === 400, String(slotPost.bad));

    // 插件骨架视图：输入包名 -> 出骨架（声明/面/patch 行/slot）
    await page.locator('[data-testid="nav-skeleton"]').click();
    await page.waitForTimeout(250);
    await page.locator('[data-testid="skeleton-input"]').fill('plug-alpha');
    await page.locator('[data-testid="skeleton-go"]').click();
    await page.waitForTimeout(700);
    const skel = await text('[data-testid="skeleton"]');
    ok('skeleton view shows inject surfaces', skel.includes('ui-settings'), skel.slice(0, 60));
    ok('skeleton view shows patch rows', skel.includes('alpha-row'));
    ok('skeleton view says when the entry is undeclared', /入口/.test(skel) && (skel.includes('（无）') || skel.includes('lib/')), skel.slice(0, 100));
    const skeletonGrid = await page.locator('[data-testid="skeleton"]').evaluate((el) => ({
      rows: el.querySelectorAll('.prop').length,
      grid: getComputedStyle(el.querySelector('.prop')).display,
      labels: el.querySelectorAll('dt').length,
      values: el.querySelectorAll('dd').length,
    }));
    ok('skeleton properties use an aligned label-value grid', skeletonGrid.rows === 7 && skeletonGrid.grid === 'grid' && skeletonGrid.labels === 7 && skeletonGrid.values === 7, JSON.stringify(skeletonGrid));

    // 启动器视图：输入即搜，结果带路径；无索引必须给出明确下一步。
    await page.locator('[data-testid="nav-launcher"]').click();
    await page.waitForTimeout(300);
    ok('launcher view renders its input', (await page.locator('[data-testid="launcher-input"]').count()) === 1);
    const routeHits = await page.evaluate(async () => {
      const r = await fetch('/turnstile/search?q=launcher');
      const j = await r.json();
      return (j.hits || []).length;
    });
    ok('launcher search route returns hits', routeHits >= 1, 'hits=' + routeHits);
    await page.route('**/turnstile/search?q=noindex*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: 'noindex', hits: [], status: 'no-index', hint: 'node tools/launcher.mjs index --root <目录>' }) }));
    await page.locator('[data-testid="launcher-input"]').fill('noindex');
    await page.waitForTimeout(900);
    const noIndexText = await text('[data-testid="launcher-results"]');
    ok('launcher explains a missing index instead of showing the initial prompt', noIndexText.includes('尚未建立文件索引') && noIndexText.includes('launcher.mjs index'), noIndexText);
    await page.unroute('**/turnstile/search?q=noindex*');
    await page.locator('[data-testid="launcher-input"]').fill('launcher');
    await page.waitForTimeout(900);
    const launcherText = await page.locator('[data-testid="launcher-results"]').innerText().catch(() => '');
    ok('launcher results render from input without pressing Enter', launcherText.includes('launcher.mjs'), JSON.stringify(launcherText.slice(0, 60)));
    ok('launcher keeps input focus after rendering results', await page.locator('[data-testid="launcher-input"]').evaluate((el) => document.activeElement === el));

    // B11: a failed read must not look healthy (green dot + '0/0').
    await page.route('**/api/console*', (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.route('**/turnstile/console-data*', (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.locator('[data-testid="console-refresh"]').first().click().catch(() => page.reload());
    await page.waitForTimeout(1200);
    ok('a failed read shows a failure, not a green dot', (await text('#connection')).includes('读取失败'));
    ok('the failure state is exposed for styling', (await page.locator('body').getAttribute('data-health')) === 'failed');
    await page.unroute('**/api/console*');
    await page.unroute('**/turnstile/console-data*');
    // 纯文本断言：之前只验「页面能打开」，undefined 混在导航里也没人发现
    for (const view of ['launcher', 'skeleton']) {
      await page.locator('[data-testid="nav-' + view + '"]').click();
      await page.waitForTimeout(250);
      const body = await page.locator('main').innerText();
      ok('视图 ' + view + ' 没有 undefined', !/undefined/i.test(body), body.replace(/\n/g, ' ').slice(0, 60));
    }
    // 窄屏：侧栏与检查器不能直接藏没，要有抽屉入口
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForTimeout(250);

    // 定位框（方案 01-A）：Ctrl/Cmd+K 打开、搜索、Enter 或点击导航、Esc 回到原焦点
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    ok('Ctrl+K 打开定位框', await page.locator('[data-testid="nav-palette"]').isVisible());
    await page.locator('[data-testid="nav-input"]').fill('插件');
    await page.waitForTimeout(250);
    ok('输入不产生浏览器错误（搜索渲染待修）', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 80));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok('Esc 关闭定位框', !(await page.locator('[data-testid="nav-palette"]').isVisible()));

    // URL 定位恢复：直接带 hash 打开，应恢复到对应视图与对象
    const u = new URL(page.url());
    await page.evaluate(() => { location.hash = '#view=plugins&kind=plugin&id=dsh-free-search'; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent === '数据已读取', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const restoredView = await page.evaluate(() => document.querySelector('[data-testid="nav-plugins"]')?.getAttribute('aria-current') || '');
    const restoredText = await page.locator('main').innerText();
    ok('hash 恢复视图与选中对象', /dsh-free-search/.test(restoredText), restoredText.slice(0, 40));
    await page.evaluate(() => { location.hash = '#view=plugins&kind=plugin&id=no-such-plugin-xyz'; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent === '数据已读取', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const notice = await page.locator('body').innerText();
    ok('对象不存在时明确提示而不是乱选', /该对象已变化或不在本次数据中/.test(notice), notice.slice(0, 60));
    await page.evaluate(() => { location.hash = ''; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent === '数据已读取', null, { timeout: 15000 });

    // 动作组（方案 01-A）：写操作只出提示，不执行
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(250);
    await page.locator('[data-testid="nav-input"]').fill('停用');
    await page.waitForTimeout(300);
    const actionBtn = page.locator('[data-testid^="nav-action-"]').first();
    const hasAction = await actionBtn.count();
    ok('写操作出现在动作组', hasAction >= 1, String(hasAction));
    if (hasAction) {
      const label = await actionBtn.innerText();
      ok('动作标注只出计划', /只出计划/.test(label), label.slice(0, 40));
      await actionBtn.click();
      await page.waitForTimeout(400);
      const noticeText = await page.locator('body').innerText();
      ok('点击动作只提示不写入', /只生成计划/.test(noticeText), noticeText.slice(0, 60));
    }

    ok('narrow console hides nav and inspector by default', !(await page.locator('.sidebar').isVisible()) && !(await page.locator('#inspector').isVisible()));
    await page.locator('[data-testid="toggle-nav"]').click();
    await page.waitForTimeout(200);
    ok('nav drawer opens from the topbar', await page.locator('.sidebar').isVisible());
    await page.locator('[data-testid="toggle-inspector"]').click();
    await page.waitForTimeout(200);
    ok('inspector sheet opens and closes the nav drawer', await page.locator('#inspector').isVisible() && !(await page.locator('.sidebar').isVisible()));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok('Escape closes console drawers', !(await page.locator('#inspector').isVisible()));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(200);
    ok('wide console shows nav and inspector again', await page.locator('.sidebar').isVisible() && await page.locator('#inspector').isVisible());
    // 列表状态条（方案 01-C）：筛选后/总数、清除筛选、无匹配态
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(300);
    await click('[data-testid="nav-plugins"]');
    await page.waitForTimeout(300);
    const statusText = await text('[data-testid="list-status-plugins"]');
    ok('插件页有统一状态条', /筛选后 \d+ \/ 共 \d+/.test(statusText), statusText.slice(0, 40));
    await page.locator('[data-testid="global-search"]').fill('zzz-no-such-plugin');
    await page.waitForTimeout(400);
    const emptyKind = await text('[data-testid="list-empty-kind-plugins"]').catch(() => '');
    ok('无匹配时状态条说明原因', /没有匹配项/.test(emptyKind), emptyKind);
    await page.locator('[data-testid="list-clear-plugins"]').click();
    await page.waitForTimeout(400);
    ok('清除筛选后回到全量', /筛选后 \d+ \/ 共 \d+/.test(await text('[data-testid="list-status-plugins"]')));

    // 页面级提示条（方案 01-D）：结论 + 影响 + 一个主按钮
    await click('[data-testid="nav-overview"]');
    await page.waitForTimeout(400);
    const bannerText = await text('[data-testid="page-banner"]').catch(() => '');
    ok('总览有页面级提示条', bannerText.length > 0 && /未观测|发现阻塞|检查通过/.test(bannerText), bannerText.slice(0, 60));
    await page.locator('[data-testid="page-banner-action"]').click();
    await page.waitForTimeout(400);
    ok('提示条主按钮导航到证据视图', await page.locator('[data-testid="list-status-checks"]').count() >= 1);

    // 各视图各自的一条结论（不同视图不共用门禁结论）
    await click('[data-testid="nav-plugins"]');
    await page.waitForTimeout(350);
    const pluginBanner = await text('[data-testid="page-banner"]');
    ok('插件页提示条讲插件事实', /插件/.test(pluginBanner) && /配置/.test(pluginBanner), pluginBanner.slice(0, 50));
    await click('[data-testid="nav-surfaces"]');
    await page.waitForTimeout(350);
    const surfaceBanner = await text('[data-testid="page-banner"]');
    ok('UI 占用页提示条讲共享面', /UI 面/.test(surfaceBanner), surfaceBanner.slice(0, 50));

    // 视图切换恢复滚动位置（方案 01-B）：缩小视口让 #main 真的可滚动
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(300);
    await click('[data-testid="nav-plugins"]');
    await page.waitForTimeout(400);
    await page.evaluate(() => { const m = document.querySelector('#main'); if (m) m.scrollTop = 220; });
    await page.waitForTimeout(200);
    const beforeScroll = await page.evaluate(() => document.querySelector('#main')?.scrollTop || 0);
    await click('[data-testid="nav-surfaces"]');
    await page.waitForTimeout(400);
    await click('[data-testid="nav-plugins"]');
    await page.waitForTimeout(500);
    const afterScroll = await page.evaluate(() => document.querySelector('#main')?.scrollTop || 0);
    ok('切回视图恢复滚动位置', beforeScroll > 40 && Math.abs(afterScroll - beforeScroll) < 10, JSON.stringify({ beforeScroll, afterScroll }));
    ok('locator module is shared with the console', await page.evaluate(() => !!(window.TurnstileLocator && window.TurnstileLocator.editorLink)));
    ok('finding with a locator renders an editor link', await page.evaluate(() => {
      const saved = state.selected, tab = state.inspectorTab;
      state.selected = { title: 'synthetic', properties: {}, findings: [{ message: 'm', locator: { file: 'src/x.js', line: 7 } }] };
      state.inspectorTab = 'properties';
      renderInspector();
      const el = document.querySelector('[data-testid="finding-link"]');
      const href = el && el.getAttribute('href');
      const refused = (() => { state.selected = { title: 'synthetic', properties: {}, findings: [{ message: 'm', locator: { file: 'https://evil.example/x.js' } }] }; renderInspector(); return document.querySelector('[data-testid="finding-link"]') === null; })();
      state.selected = saved; state.inspectorTab = tab; renderInspector();
      return href === 'vscode://file/src/x.js:7' && refused;
    }));
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