// 视觉证据：把控制台与搭建器在宽屏/窄屏各截一张，供人工验收（不是自动判定）。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'state', 'shots');
mkdirSync(outDir, { recursive: true });
const profileDir = join(root, 'tests', 'console-fixture');
const server = createConsoleServer({ profileDir, stateDir: join(root, 'state', 'shots-state'), fixture: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge' });
const shots = [];
for (const [name, path, w, h] of [
  ['console-wide', '/console', 1280, 900],
  ['console-narrow', '/console', 390, 760],
  ['builder-wide', '/turnstile/builder', 1280, 900],
  ['builder-narrow', '/turnstile/builder', 390, 760],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(700);
  const file = join(outDir, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
  await page.close();
}
await browser.close();
server.close();
console.log(JSON.stringify({ ok: true, shots }, null, 2));