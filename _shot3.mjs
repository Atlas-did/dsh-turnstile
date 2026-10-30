import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await p.goto('file:///C:/Users/finef/Desktop/mini-harness/state/.archify/architecture-dsh-plugins/out.html', { waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(2500);
await p.screenshot({ path: 'C:/Users/finef/Desktop/mini-harness/state/arch-check.png', fullPage: false });
console.log('shot done');
await b.close();