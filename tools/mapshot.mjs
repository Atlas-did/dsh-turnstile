// Screenshot a local HTML file with the system Edge (playwright-core).
import { chromium } from 'playwright-core';
const file = process.argv[2];
const out = process.argv[3] || 'state/gate-map.png';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'load' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('shot -> ' + out);