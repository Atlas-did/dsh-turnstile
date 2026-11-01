// P1-1：真实宿主与独立控制台必须共用同一份版本保护（先测纯 store，再测两个服务器）。
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPage, writePage, pageVersion } from '../plugins/turnstile-popup/lib/page-store.js';
import { createConsoleServer } from './console-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'ps-'));
const file = join(tmp, 'page.json');
const page = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [] } };

ok('文件不存在时 version=0', String(readPage(file).version) === '0');
const w1 = writePage(file, page);
ok('首次写入成功', w1.ok && /^[a-f0-9]{16}$/.test(String(w1.version)), String(w1.version));
ok('写后能读回', readPage(file).page.root.id === 'r');

const stale = writePage(file, page, { baseVersion: '0' });
ok('过期版本写入被拒（stale）', stale.ok === false && stale.stale === true);
ok('stale 带回当前版本', stale.version === pageVersion(file));

const w2 = writePage(file, page, { baseVersion: w1.version });
ok('当前版本可写', w2.ok === true, String(w2.version));

// 内容哈希版本：写完**不同内容**后，旧版本必须失效（这才是真正的覆盖保护）
const page2 = { schema: 'mini/page@1', root: { id: 'r2', type: 'stack', children: [] } };
writePage(file, page2, { baseVersion: w2.version });
const staleOlder = writePage(file, page, { baseVersion: w2.version });
ok('内容被改后旧版本不能再写', staleOlder.ok === false && staleOlder.stale === true);

// 独立控制台（真实服务器）也必须是同一套行为
const profileDir = join(tmp, 'profile');
writeFileSync(join(tmp, 'keep.txt'), 'x');
const fs2 = await import('node:fs');
fs2.mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
const server = createConsoleServer({ profileDir, stateDir: join(tmp, 'state') });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const post = async (body) => { const r = await fetch(base + '/turnstile/page', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const first = await post({ page });
ok('控制台首次保存返回 version', first.status === 200 && typeof first.body.version === 'string' && first.body.version.length === 16, String(first.body.version));
const stalePost = await post({ page, baseVersion: '0' });
ok('控制台过期写入 409', stalePost.status === 409 && stalePost.body.stale === true);
const good = await post({ page, baseVersion: first.body.version });
ok('控制台当前版本写入 200', good.status === 200);

server.close();
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'PAGE_STORE_FAILED ' + fail : 'PAGE_STORE_OK');
process.exitCode = fail ? 1 : 0;