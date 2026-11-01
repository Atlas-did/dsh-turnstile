// 两个 promote 的分工必须写在行为里，而不是只写在注释里。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixture = join(root, 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const run = (script, args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(root, 'tools', script), ...args], { encoding: 'utf8', timeout: 120000 }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

// promote.mjs 是「搬文件」那个：必须提示改用 sandbox-promote
// 提示走 stderr，execFileSync 成功时只回 stdout —— 用 spawnSync 两路都要
import { spawnSync } from 'node:child_process';
const p2 = spawnSync(process.execPath, [join(root, 'tools', 'promote.mjs'), '--from', fixture, '--to', fixture], { encoding: 'utf8' });
const p = { code: p2.status, out: String(p2.stdout || '') + String(p2.stderr || '') };
ok('promote 提示常规推送用 sandbox-promote', /sandbox-promote/.test(p.out), p.out.split('\n')[0]);
ok('promote 仍能出计划', /主环境/.test(p.out) || /from/.test(p.out), p.out.split('\n')[2] || '');

// sandbox-promote.mjs 是「比配置」那个：默认 dry-run，要求两个参数
const sp = run('sandbox-promote.mjs', [fixture, fixture]);
ok('sandbox-promote 跑起来并报告差异结论', /promote ·|没有差异|将写入/.test(sp.out), sp.out.trim().split('\n')[1].slice(0, 40));
const spBad = run('sandbox-promote.mjs', []);
ok('sandbox-promote 缺参数时明确报用法', spBad.code !== 0 && /usage|用法/.test(spBad.out), spBad.out.trim().slice(0, 40));

console.log(fail ? 'PROMOTE_SPLIT_FAILED ' + fail : 'PROMOTE_SPLIT_OK');
process.exitCode = fail ? 1 : 0;
