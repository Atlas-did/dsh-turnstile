// /turnstile/run 的契约与安全约束（02 设计 §4.2/§4.4）。
import { handleRun, _resetForTests } from '../lib/run-route.js';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const profile = join(mkdtempSync(join(tmpdir(), 'run-route-profile-')), 'console-fixture');
const state = mkdtempSync(join(tmpdir(), 'run-route-state-'));
cpSync('tests/console-fixture', profile, { recursive: true });
process.env.DSH_TURNSTILE_STATE = state;

_resetForTests();

// 1) 只读命令直跑
const read = await handleRun({ command: 'inspect', args: { profile, pkg: 'plug-alpha' } });
ok('只读命令返回 200', read.status === 200 && read.body.verdict === 'ok', read.status + ' ' + read.body.verdict);
ok('契约字段齐全', ['ok','verdict','summary','exitCode','durationMs','next'].every((k) => k in read.body), Object.keys(read.body).join(','));

// 2) 未知命令 404（白名单即注册表）
const unknown = await handleRun({ command: 'rm-rf', args: {} });
ok('未知命令 404', unknown.status === 404, String(unknown.status));

// 3) 写操作没有 dryRun → 403
const noToken = await handleRun({ command: 'snapshot-take', args: { profile } });
ok('写操作必须先 dry-run', noToken.status === 403 && /dry-run/.test(noToken.body.summary), noToken.body.summary.slice(0, 24));

// 4) dryRun 签发 token
_resetForTests();
const dry = await handleRun({ command: 'snapshot-take', args: { profile }, dryRun: true });
ok('dryRun 成功并签发 applyToken', dry.status === 200 && typeof dry.body.applyToken === 'string' && dry.body.applyToken.length > 10, String(dry.status));
ok('drySafe:false 的路由计划阶段不写快照', !existsSync(join(state, 'snapshots')) && dry.body.data?.dryRun === true);

// 5) 用 token 执行成功，且 token 一次性
const applied = await handleRun({ command: 'snapshot-take', args: { profile }, applyToken: dry.body.applyToken });
ok('带 token 执行成功', applied.status === 200 && applied.body.ok === true, String(applied.status));
ok('只有确认执行后才写快照', existsSync(join(state, 'snapshots')));
const reuse = await handleRun({ command: 'snapshot-take', args: { profile }, applyToken: dry.body.applyToken });
ok('token 不能复用', reuse.status === 403, String(reuse.status));

// 6) token 绑定参数：换参数后必须拒绝
_resetForTests();
const dry2 = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-alpha' }, dryRun: true });
const swapped = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-beta' }, applyToken: dry2.body.applyToken });
ok('token 与参数绑定（换参数被拒）', swapped.status === 403 && /不匹配/.test(swapped.body.summary), swapped.body.summary.slice(0, 20));

// 7) 高危命令要逐字 confirm（设计 §4.4-3）
_resetForTests();
const dDry = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-beta' }, dryRun: true });
const dNo = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-beta' }, applyToken: dDry.body.applyToken });
ok('高危操作缺 confirm → 403', dNo.status === 403 && /confirm/.test(dNo.body.summary), dNo.body.summary.slice(0, 24));
const dWrong = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-beta' }, applyToken: dDry.body.applyToken, confirm: 'plug-alpha' });
ok('confirm 写错目标 → 403', dWrong.status === 403, String(dWrong.status));
const dGood = await handleRun({ command: 'manage-disable', args: { profile, package: 'plug-beta' }, applyToken: dDry.body.applyToken, confirm: 'plug-beta' });
ok('confirm 正确 → 执行', dGood.status === 200 && dGood.body.ok === true, String(dGood.status));

// 8) 连点去重
_resetForTests();
_resetForTests();
await handleRun({ command: 'snapshot-take', args: { profile }, dryRun: true });
const again = await handleRun({ command: 'snapshot-take', args: { profile }, dryRun: true });
ok('2 秒内重复 dry-run 被限流', again.status === 429, String(again.status));

console.log(fail ? 'RUN_ROUTE_FAILED ' + fail : 'RUN_ROUTE_OK');
process.exitCode = fail ? 1 : 0;
