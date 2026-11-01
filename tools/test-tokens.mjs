// 设计令牌：控制台与搭建器必须读同一份，且窄屏不能把面板藏没。
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const css = readFileSync(join(here, '..', 'plugins', 'turnstile-popup', 'lib', 'tokens.css'), 'utf8');

for (const v of ['--bg', '--text', '--accent', '--status-ok', '--status-fail', '--s1', '--fs-md', '--r-md']) {
  ok('令牌 ' + v + ' 有定义', css.includes(v + ':'));
}
ok('焦点可见规则存在', /:focus-visible/.test(css));
ok('窄屏有抽屉规则（不是直接藏）', /tier-drawer-open/.test(css) && /tier-sheet-open/.test(css));

const consoleHtml = readFileSync(join(here, '..', 'plugins', 'turnstile-popup', 'lib', 'console.html'), 'utf8');
const builderHtml = readFileSync(join(here, '..', 'plugins', 'turnstile-popup', 'lib', 'builder.html'), 'utf8');
ok('控制台引用了 tokens.css', consoleHtml.includes('/turnstile/tokens.css'));
ok('搭建器引用了 tokens.css', builderHtml.includes('/turnstile/tokens.css'));

// 服务端真的能把它当 CSS 发出来
const tmp = mkdtempSync(join(tmpdir(), 'tok-'));
const profileDir = join(tmp, 'p');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
const server = createConsoleServer({ profileDir, stateDir: join(tmp, 's') });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const res = await fetch(base + '/turnstile/tokens.css');
const body = await res.text();
ok('GET /turnstile/tokens.css 返回 200', res.status === 200, String(res.status));
ok('content-type 是 CSS 而不是 JS', String(res.headers.get('content-type')).includes('text/css'), String(res.headers.get('content-type')));
ok('响应体就是令牌表', body.includes('--status-fail'));
server.close();
rmSync(tmp, { recursive: true, force: true });

console.log(fail ? 'TOKENS_FAILED ' + fail : 'TOKENS_OK');
process.exitCode = fail ? 1 : 0;