// Virtual list: a node with hundreds of children must not build hundreds of DOM cards.
import { createConsoleServer } from './console-server.mjs';
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const N = 200;
const tmp = mkdtempSync(join(tmpdir(), 'vlist-'));
const profileDir = join(tmp, 'big-fixture');
mkdirSync(join(profileDir, 'node_modules'), { recursive: true });
const bundles = [];
for (let i = 0; i < N; i++) {
  const name = 'bulk-' + String(i).padStart(3, '0');
  const dir = join(profileDir, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: ' + name + '\n      name: ' + name + '\n');
  bundles.push(name);
}
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'big-fixture', private: true, dsh: { profile: { bundles } } }));
writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n');

const server = createConsoleServer({ profileDir, stateDir: join(profileDir, '.turnstile') });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
let browser = null;
for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel, headless: true }); break; } catch {} }
if (!browser) browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const ok = (name, cond, detail) => { if (cond) console.log('ok   ' + name); else { failed++; console.log('FAIL ' + name + '  ' + (detail || '')); } };

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="nav-architecture"]');
await page.locator('[data-testid="nav-architecture"]').click();
await page.waitForTimeout(1200);
const profileCrumb = page.locator('[data-testid="breadcrumb-profile"]');
if (await profileCrumb.count()) { await profileCrumb.first().click(); await page.waitForTimeout(800); }
const depthText = await page.locator('.depth').first().innerText();
ok('the profile node reports its 200 children', depthText.includes(String(N)), depthText);
const rendered = await page.evaluate(() => {
  const box = document.querySelector('[data-testid="arch-virtual"]');
  return box ? Number(box.dataset.rendered || 0) : -1;
});
ok('a huge child list switches to the virtual list', rendered > 0, String(rendered));
ok('only a window of rows is built', rendered > 0 && rendered < 60, String(rendered));

const firstLabel = await page.locator('[data-arch-id] strong').first().innerText();
await page.evaluate(() => { const b = document.querySelector('[data-testid="arch-virtual"]'); b.scrollTop = b.scrollHeight; b.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(400);
const lastLabel = await page.locator('[data-arch-id] strong').first().innerText();
ok('scrolling swaps the rendered window', firstLabel !== lastLabel, firstLabel + ' -> ' + lastLabel);
ok('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(failed ? ('RESULT: ' + failed + ' failed') : 'RESULT: all checks passed');
process.exitCode = failed ? 1 : 0;