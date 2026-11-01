// 多标签页/外部修改保护：保存必须带 baseVersion，过期就 409，不静默覆盖。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'pagever-'));
const profileDir = join(tmp, 'profile');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
const server = createConsoleServer({ profileDir, stateDir: join(tmp, 'state') });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const post = async (body) => { const r = await fetch(base + '/turnstile/page', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const pageA = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [] }, meta: { pluginName: 'a' } };

const first = await post({ page: pageA, baseVersion: 0 });
ok('首次保存（无文件）成功', first.status === 200 && typeof first.body.version === 'string' && first.body.version.length === 16, String(first.body.version));
const v1 = first.body.version;

const get1 = await (await fetch(base + '/turnstile/page')).json();
ok('GET 带 version', typeof get1.version === 'string' && get1.version === v1, String(get1.version));

const stale = await post({ page: pageA, baseVersion: 0 });
ok('过期版本保存被拒 409', stale.status === 409 && stale.body.stale === true, String(stale.status));
ok('409 带回当前版本供重载', stale.body.version === v1, String(stale.body.version));

const pageB = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [{ id: 'x', type: 'text', props: { text: '改过' } }] }, meta: { pluginName: 'a' } };
const good = await post({ page: pageB, baseVersion: v1 });
ok('当前版本保存成功', good.status === 200, String(good.status));
ok('内容变了版本也变', good.body.version !== v1, v1 + ' → ' + good.body.version);

const noVersion = await post({ page: pageB });
ok('覆盖已有页面必须带 baseVersion（否则 428）', noVersion.status === 428 && noVersion.body.needsVersion === true, String(noVersion.status));

server.close();
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'PAGE_VERSION_FAILED ' + fail : 'PAGE_VERSION_OK');
process.exitCode = fail ? 1 : 0;