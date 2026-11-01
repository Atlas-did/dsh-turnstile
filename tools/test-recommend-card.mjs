// 推荐目录与卡片生成：两者都是「给人看的输出」，必须可解析、不吹牛。
import { execFileSync, spawnSync } from 'node:child_process';
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
ok('每个插件都有 status', cat.plugins.every((p) => ['installed', 'verified', 'unverified'].includes(p.status)));
ok('installed 必须带证据', cat.plugins.filter((p) => p.status === 'installed').every((p) => p.verified && p.verified.length > 10));
ok('status 只允许三档', cat.plugins.every((p) => ['installed', 'verified', 'unverified'].includes(p.status)));
ok('每条都必须有 evidence 数组', cat.plugins.every((p) => Array.isArray(p.evidence) && p.evidence.length > 0), cat.plugins.filter((p) => !Array.isArray(p.evidence)).map((p) => p.name).join(','));
ok('verified 不等于 installed（不许混）', cat.plugins.every((p) => p.status !== 'verified' || p.verified.length > 10));

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

// 渲染硬规则：颜色会直接导致「显示异常」
const flat = JSON.stringify(card);
ok('卡片里没有任何颜色样式', !/(^|\")[^\"]*color\s*:/.test(flat), ((/color\s*:/.exec(flat) || [])[0] || 'none'));
const vres = (() => {
  try {
    const r = spawnSync(process.execPath, [join(root, 'tools', 'card.mjs'), '--kind', 'slots', '--from', slots, '--validate'], { encoding: 'utf8' });
    return { code: r.status, err: String(r.stderr || '') };
  } catch (e) { return { code: 1, err: String(e.message) }; }
})();
ok('--validate 退出码 0 且报合规', vres.code === 0 && /卡片合规/.test(vres.err), vres.code + ' ' + vres.err.slice(0, 30));

// health 卡片：detail 必须来自 checks[i].findings[]（外部审查说这里恒为空）
const report = join(dir, 'report.json');
writeFileSync(report, JSON.stringify({
  profile: 'p', result: 'blocking', blocking: 1,
  checks: [
    { name: 'prompt-vars', ok: false, findings: [{ severity: 'error', message: 'unsupported variable ${X}' }] },
    { name: 'profile-yaml', ok: true, findings: [] },
  ],
}));
const healthOut = run('card.mjs', ['--kind', 'health', '--from', report]);
const healthCard = JSON.parse(healthOut.split('```schemaJson')[1].split('```')[0].trim());
const hgrid = healthCard.children[0].children.find((c) => c.componentName === 'TinyGrid');
ok('health 卡片有 2 行', hgrid.props.data.length === 2);
ok('fail 行的 detail 来自 findings', hgrid.props.data[0].detail.includes('${X}'), hgrid.props.data[0].detail);
ok('状态映射正确', hgrid.props.data[0].state === 'fail' && hgrid.props.data[1].state === 'pass');

let refused = '';
try { execFileSync(process.execPath, [join(root, 'tools', 'card.mjs'), '--kind', 'slots', '--from', join(dir, 'nope.json')], { stdio: 'pipe' }); }
catch (e) { refused = String(e.stderr || ''); }
ok('缺文件明确报错', /找不到文件/.test(refused), refused.trim().slice(0, 30));

console.log(fail ? 'RECOMMEND_TEST_FAILED ' + fail : 'RECOMMEND_TEST_OK');
process.exitCode = fail ? 1 : 0;
