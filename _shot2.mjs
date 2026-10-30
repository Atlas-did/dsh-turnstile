import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const log = readFileSync('C:/Users/finef/Desktop/mini-harness/logs/mini.log', 'utf8');
const token = (log.match(/token=([A-Za-z0-9_-]+)/) || [])[1];
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
await p.goto('http://127.0.0.1:18770/?token=' + token, { waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForTimeout(4500);
const clicked = await p.evaluate(() => {
  const list = Array.from(document.querySelectorAll('div')).filter((d) => (d.textContent || '').indexOf('dsh-context') !== -1 && d.style.cursor === 'pointer');
  const t = list[list.length - 1];
  if (!t) return 'none';
  t.click();
  return 'clicked';
});
await p.waitForTimeout(1500);
await p.screenshot({ path: 'C:/Users/finef/Desktop/mini-harness/state/popup-props.png' });
console.log('dispatch:', clicked);
await b.close();