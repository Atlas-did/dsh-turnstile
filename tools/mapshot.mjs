// Screenshot a local HTML file with the system Edge (playwright-core).
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch {
  console.error('mapshot needs playwright-core (npm i -D playwright-core) and a system Edge/Chrome.');
  process.exit(3);
}
import { pathToFileURL } from 'node:url';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/mapshot.mjs <file.html> [out.png]'); process.exit(2); }
const out = process.argv[3] || 'state/gate-map.png';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('shot -> ' + out);