#!/usr/bin/env node
// Screenshot the running DSH web UI so an agent can look before/after a change.
// usage: node tools/capture.mjs --port 18770 --log <dsh log> --out shot.png
//          [--selector <css>] [--full] [--wait 1500] [--url <explicit url>]
// exit 0 wrote a png | 2 usage | 3 could not capture (no browser / no page) 
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const out = val('--out');
if (!out) { console.error('usage: node tools/capture.mjs --port 18770 --log <log> --out shot.png [--selector css] [--full]'); process.exit(2); }
const port = val('--port') || '18770';
const logFile = val('--log');
const selector = val('--selector');
const full = argv.includes('--full');
const wait = Number(val('--wait') || 2500);
let url = val('--url');
if (!url) {
  if (!logFile) { console.error('need --log <dsh log> (to read the token) or --url'); process.exit(2); }
  let token = '';
  try { token = (readFileSync(logFile, 'utf8').match(/token=([A-Za-z0-9_-]+)/) || [])[1] || ''; } catch { /* ignore */ }
  url = 'http://127.0.0.1:' + port + '/?token=' + token;
}

let browser = null;
try { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
catch (e) { console.log('SKIP: no browser (' + String(e.message).slice(0, 60) + ')'); process.exit(3); }

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(wait);
  mkdirSync(dirname(out), { recursive: true });
  if (selector) {
    const el = page.locator(selector).first();
    if (!(await el.count())) { console.log('selector not found: ' + selector); process.exit(3); }
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: full });
  }
  console.log('captured -> ' + out);
} catch (e) {
  console.log('capture failed: ' + String(e.message).slice(0, 120));
  process.exitCode = 3;
} finally {
  await browser.close().catch(() => {});
}
