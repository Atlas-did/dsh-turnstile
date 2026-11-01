// CLI 侧 applyToken（05 指南 步骤 3）：写操作没有 token 就 exit 2；token 一次性、绑定参数。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'tools', 'turnstile.mjs');
const fixture = join(here, '..', 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 120000 }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

const noToken = run(['manage-disable', fixture, 'plug-beta', '--apply']);
ok('写操作无 token → exit 2', noToken.code === 2, String(noToken.code));
ok('拒绝原因指向 --dry-run', /--dry-run/.test(noToken.out), noToken.out.trim().slice(0, 30));

const dry = run(['manage-disable', fixture, 'plug-beta', '--dry-run']);
const j = JSON.parse(dry.out);
ok('dry-run 出计划', dry.code === 0 && Array.isArray(j.plan) && j.plan.length === 1, (j.plan || [''])[0].slice(0, 40));
ok('dry-run 签发 applyToken', typeof j.applyToken === 'string' && j.applyToken.length > 20);

const good = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken]);
ok('带 token 执行成功', good.code === 0 && good.out.includes('verdict'), String(good.code));

const reuse = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken]);
ok('token 一次性', reuse.code === 2 && /无效|过期/.test(reuse.out), String(reuse.code));

// 参数被改：用 plug-beta 的 token 去停 plug-alpha
const d2 = JSON.parse(run(['manage-disable', fixture, 'plug-alpha', '--dry-run']).out);
const swapped = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', d2.applyToken]);
ok('token 绑定参数（换目标被拒）', swapped.code === 2 && /不匹配/.test(swapped.out), swapped.out.trim().slice(0, 24));

console.log(fail ? 'CLI_TOKEN_FAILED ' + fail : 'CLI_TOKEN_OK');
process.exitCode = fail ? 1 : 0;
