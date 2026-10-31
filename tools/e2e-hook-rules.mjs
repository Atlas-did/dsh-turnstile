// A profile-owned hook rule must change the designer's behaviour, not just sit in a file.
import { createConsoleServer } from './console-server.mjs';
import { copyTreeSafe } from './safe-copy.mjs';
import { chromium } from 'playwright-core';
import { join, dirname } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const tmp = mkdtempSync(join(tmpdir(), 'hkr-'));
const profileDir = join(tmp, 'console-fixture');
copyTreeSafe(join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'tests', 'console-fixture'), profileDir);
const stateDir = join(profileDir, '.turnstile');
mkdirSync(stateDir, { recursive: true });
writeFileSync(join(stateDir, 'hooks.json'), JSON.stringify({ rules: [
  { id: 'cap-1', event: 'beforeEnqueue', kind: 'queue-limit', max: 1, reason: '这个 profile 只允许一条命令。' },
] }));

const server = createConsoleServer({ profileDir, stateDir });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const hooksRes = await fetch(base + '/turnstile/hooks');
const hooksJson = await hooksRes.json();
console.log('rules source:', hooksJson.source, 'count:', hooksJson.rules.length);

let browser = null;
for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel, headless: true }); break; } catch {} }
if (!browser) browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
let failed = 0;
const ok = (name, cond, detail) => { if (cond) console.log('ok   ' + name); else { failed++; console.log('FAIL ' + name + '  ' + (detail || '')); } };
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="nav-designer"]');
await page.locator('[data-testid="nav-designer"]').click();
await page.waitForTimeout(1200);
ok('the host reports the profile rule', hooksJson.source === 'state/hooks.json' && hooksJson.rules.length === 1, JSON.stringify(hooksJson.source));
await page.locator('[data-testid="palette-Common"]').click().catch(() => {});
await page.locator('[data-testid="designer-add-toggle"]').click();
await page.waitForTimeout(300);
const after1 = await page.locator('[data-testid^="command-delete-"]').count();
await page.locator('[data-testid="designer-add-anchor"]').click();
await page.waitForTimeout(400);
const after2 = await page.locator('[data-testid^="command-delete-"]').count();
const notice = await page.locator('[data-testid="designer-error"]').first().innerText().catch(() => '');
ok('the rule stops the second command', after1 === after2, after1 + '->' + after2);
ok('the refusal quotes the profile rule', notice.includes('只允许一条命令'), notice);
await browser.close();
server.close();
console.log(failed ? ('RESULT: ' + failed + ' failed') : 'RESULT: all checks passed');
process.exitCode = failed ? 1 : 0;