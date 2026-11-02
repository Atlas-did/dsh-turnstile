// 复审 P2-2：超大请求必须得到结构化 413，而不是 socket 中断。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';
import { installTokenFetch } from './lib/test-auth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'jb-'));
const profileDir = join(tmp, 'p');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
const server = createConsoleServer({ profileDir, stateDir: join(tmp, 's') });
installTokenFetch(server.turnstileToken);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const big = JSON.stringify({ command: 'doctor', args: {}, pad: 'x'.repeat(1_000_000) });
const res = await fetch(base + '/turnstile/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: big });
ok('超大请求返回 413', res.status === 413, String(res.status));
const body = await res.json().catch(() => null);
ok('413 带结构化错误信息', Boolean(body && /过大/.test(String(body.error))), JSON.stringify(body).slice(0, 60));

const bad = await fetch(base + '/turnstile/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
ok('非 JSON 返回 400（不是 socket 错误）', bad.status === 400, String(bad.status));
const viewBig = await fetch(base + '/turnstile/view-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: big });
ok('view-state 也使用统一请求上限', viewBig.status === 413 && /过大/.test(String((await viewBig.json()).error)), String(viewBig.status));

server.close();
rmSync(tmp, { recursive: true, force: true });
// C-07：上限按字节算。等量的「字符数」在中英文之间字节数差 3 倍，这里用中文直接验。
const { readBodyText } = await import('../plugins/turnstile-popup/lib/body.js');
const fake = (text) => ({ [Symbol.asyncIterator]: async function* () { yield Buffer.from(text); } });
let multibyteThrew = null;
try { await readBodyText(fake('中'.repeat(10)), 20); } catch (e) { multibyteThrew = e; }
ok('多字节正文按字节超限（10 个字 = 30 字节 > 20）', multibyteThrew && multibyteThrew.code === 'BODY_TOO_LARGE');
ok('同样 20 字节以内的单字节正文通过', (await readBodyText(fake('a'.repeat(20)), 20)) === 'a'.repeat(20));

console.log(fail ? 'JSON_BODY_FAILED ' + fail : 'JSON_BODY_OK');
process.exitCode = fail ? 1 : 0;