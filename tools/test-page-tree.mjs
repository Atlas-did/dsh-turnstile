import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'pv-'));
const profileDir = join(tmp, 'profile');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
const stateDir = join(tmp, 'state');
const server = createConsoleServer({ profileDir, stateDir });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const post = async (body) => { const r = await fetch(base + '/turnstile/page', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const good = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [{ id: 'a', type: 'text', props: { text: 'hi' } }] } };
ok('好页面可以保存', (await post({ page: good })).status === 200);

const dup = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [{ id: 'x', type: 'text' }, { id: 'x', type: 'text' }] } };
const dupRes = await post({ page: dup });
ok('重复 id 被拒 400', dupRes.status === 400 && /重复/.test(JSON.stringify(dupRes.body)), String(dupRes.status));

const unknown = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', children: [{ id: 'u', type: 'aliens' }] } };
ok('未知组件类型被拒', (await post({ page: unknown })).status === 400);

const badRoot = { schema: 'mini/page@1', root: { id: 'r', type: 'text' } };
ok('根不是 stack 被拒', (await post({ page: badRoot })).status === 400);

const oldSchema = { schema: 'mini/page@0', root: { id: 'r', type: 'stack', children: [] } };
const oldRes = await post({ page: oldSchema });
ok('旧 schema 明确拒绝并说明', oldRes.status === 400 && /版本/.test(JSON.stringify(oldRes.body)), String(oldRes.status));

const noSchema = { root: { id: 'r', type: 'stack', children: [] } };
ok('缺 schema 被拒', (await post({ page: noSchema })).status === 400);

// 复审 P2-1：属性/样式也必须按声明校验
const badProps = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', props: { direction: 'nope' }, children: [] } };
const badPropsRes = await post({ page: badProps });
ok('非法枚举属性被拒', badPropsRes.status === 400 && /direction/.test(JSON.stringify(badPropsRes.body)), String(badPropsRes.status));

const badStyle = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', style: { fontSize: 9999 }, children: [] } };
ok('超范围样式被拒', (await post({ page: badStyle })).status === 400);

const unknownProp = { schema: 'mini/page@1', root: { id: 'r', type: 'stack', props: { nonsense: 1 }, children: [] } };
ok('未知属性被拒', (await post({ page: unknownProp })).status === 400);

server.close();
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'PAGE_TREE_FAILED ' + fail : 'PAGE_TREE_OK');
process.exitCode = fail ? 1 : 0;