// 推荐目录与卡片生成：两者都是「给人看的输出」，必须可解析、不吹牛。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (script, args) => execFileSync(process.execPath, [join(root, 'tools', script), ...args], { encoding: 'utf8', timeout: 60000 });

const cat = JSON.parse(readFileSync(join(root, 'recommendations', 'plugins.json'), 'utf8'));
ok('目录有 5 个插件', cat.plugins.length === 5, String(cat.plugins.length));
ok('每个插件都有接入方式', cat.plugins.every((p) => p.integratesWith && p.integratesWith.length > 5));
ok('每个插件都有 status', cat.plugins.every((p) => ['installed', 'unverified'].includes(p.status)));
ok('installed 必须带证据', cat.plugins.filter((p) => p.status === 'installed').every((p) => p.verified && p.verified.length > 10));

const all = JSON.parse(run('recommend.mjs', ['--json']));
ok('recommend --json 输出全部', all.plugins.length === 5);
const one = JSON.parse(run('recommend.mjs', ['--only', 'genui', '--json']));
ok('--only 过滤生效', one.plugins.length === 1 && one.plugins[0].name === 'dsh-genui');
const text = run('recommend.mjs', []);
ok('没给 profile 也能跑', /未装|已装/.test(text));

const dir = mkdtempSync(join(tmpdir(), 'card-'));
const slots = join(dir, 'slot-map.json');
writeFileSync(slots, JSON.stringify({ at: 'T', slots: [{ slot: 'shell.overlay', count: 12, entries: ['a', 'b'] }, { slot: 'x', count: 1, entries: ['c'] }] }));
const out = run('card.mjs', ['--kind', 'slots', '--from', slots]);
ok('输出被围栏包住', out.trim().startsWith('```schemaJson'));
const card = JSON.parse(out.split('```schemaJson')[1].split('```')[0].trim());
ok('根节点是 Page', card.componentName === 'Page');
ok('带 TinyCard 包裹', card.children[0].componentName === 'TinyCard');
const grid = card.children[0].children.find((c) => c.componentName === 'TinyGrid');
ok('表格行数与数据一致', grid.props.data.length === 2);

let refused = '';
try { execFileSync(process.execPath, [join(root, 'tools', 'card.mjs'), '--kind', 'slots', '--from', join(dir, 'nope.json')], { stdio: 'pipe' }); }
catch (e) { refused = String(e.stderr || ''); }
ok('缺文件明确报错', /找不到文件/.test(refused), refused.trim().slice(0, 30));

console.log(fail ? 'RECOMMEND_TEST_FAILED ' + fail : 'RECOMMEND_TEST_OK');
process.exitCode = fail ? 1 : 0;
