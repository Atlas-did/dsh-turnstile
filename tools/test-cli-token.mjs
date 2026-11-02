// CLI 侧 applyToken（05 指南 步骤 3）：写操作没有 token 就 exit 2；token 一次性、绑定参数。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'tools', 'turnstile.mjs');
// 用夹具的临时副本：测试会真写 cordis.patch.yml，不能污染 git 里那份
import { cpSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const state = mkdtempSync(join(tmpdir(), 'token-state-'));
const fixture = join(mkdtempSync(join(tmpdir(), 'token-fixture-')), 'console-fixture');
cpSync(join(here, '..', 'tests', 'console-fixture'), fixture, { recursive: true });
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, DSH_TURNSTILE_STATE: state } }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

// 先把目标恢复成启用态，保证 dry-run 走「会改动」的分支
// C-09：初始化写入必须检查返回码——它失败时后面的断言会「因为状态本来就是对的」而假绿
const initDry = run(['manage-enable', fixture, 'plug-beta', '--dry-run']);
const initApply = initDry.code === 0 ? run(['manage-enable', fixture, 'plug-beta', '--apply', '--token', JSON.parse(initDry.out).applyToken]) : { code: -1, out: 'dry-run 就没成功' };
ok('前置：目标确实恢复成启用态（初始化写入检查返回码）', initDry.code === 0 && initApply.code === 0, ('dry=' + initDry.code + ' apply=' + initApply.code + ' ' + String(initApply.out || '').trim()).slice(0, 90));
const noToken = run(['manage-disable', fixture, 'plug-beta', '--apply']);
ok('写操作无 token → exit 2', noToken.code === 2, String(noToken.code));
ok('拒绝原因指向 --dry-run', /--dry-run/.test(noToken.out), noToken.out.trim().slice(0, 30));

const dry = run(['manage-disable', fixture, 'plug-beta', '--dry-run']);
const j = JSON.parse(dry.out);
ok('dry-run 出计划', dry.code === 0 && Array.isArray(j.plan) && j.plan.length === 1, (j.plan || [''])[0].slice(0, 40));
ok('dry-run 计划是底层的真实行改动', /disabled: true/.test(j.plan[0]), j.plan[0]);
ok('dry-run 带 diff（文件+动作）', Boolean(j.diff && j.diff.file && j.diff.action === 'disable'), JSON.stringify(j.diff || {}).slice(0, 60));
ok('dry-run 签发 applyToken', typeof j.applyToken === 'string' && j.applyToken.length > 20);

const noConfirm = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken]);
ok('高危写操作缺 confirm 被拒', noConfirm.code === 2 && /--confirm plug-beta/.test(noConfirm.out), String(noConfirm.code));
const wrongConfirm = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken, '--confirm', 'plug-alpha']);
ok('confirm 与目标不一致被拒', wrongConfirm.code === 2 && /逐字一致/.test(wrongConfirm.out));
const good = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken, '--confirm', 'plug-beta']);
ok('带 token 与精确 confirm 执行成功', good.code === 0 && good.out.includes('verdict'), String(good.code));

const reuse = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', j.applyToken, '--confirm', 'plug-beta']);
ok('token 一次性', reuse.code === 2 && /无效|过期/.test(reuse.out), String(reuse.code));

// 参数被改：用 plug-beta 的 token 去停 plug-alpha
const d2 = JSON.parse(run(['manage-disable', fixture, 'plug-alpha', '--dry-run']).out);
const swapped = run(['manage-disable', fixture, 'plug-beta', '--apply', '--token', d2.applyToken, '--confirm', 'plug-beta']);
ok('token 绑定参数（换目标被拒）', swapped.code === 2 && /不匹配/.test(swapped.out), swapped.out.trim().slice(0, 24));

const patchPath = join(fixture, 'cordis.patch.yml');
const beforeAnchor = readFileSync(patchPath, 'utf8');
const anchorDry = run(['anchor', fixture, 'plug-alpha', 'top-left', '--dry-run']);
ok('anchor dry-run 返回计划和 token', anchorDry.code === 0 && JSON.parse(anchorDry.out).applyToken, String(anchorDry.code));
ok('anchor dry-run 不修改 patch', readFileSync(patchPath, 'utf8') === beforeAnchor);

const pkgPath = join(fixture, 'package.json');
const beforeFix = readFileSync(pkgPath, 'utf8');
const fixDry = run(['fix', fixture, '--dry-run']);
ok('fix dry-run 返回计划和 token', fixDry.code === 0 && JSON.parse(fixDry.out).applyToken, String(fixDry.code));
ok('fix dry-run 不修改 package.json', readFileSync(pkgPath, 'utf8') === beforeFix);

const snapshotDir = join(state, 'snapshots');
const snapshotDirect = run(['snapshot-take', fixture, '--json']);
const snapshotNoToken = run(['snapshot-take', fixture, '--apply', '--json']);
ok('snapshot-take 无模式和裸 apply 都被拒绝', snapshotDirect.code === 2 && snapshotNoToken.code === 2, snapshotDirect.code + '/' + snapshotNoToken.code);
ok('被拒绝的快照命令没有写文件', !existsSync(snapshotDir));
const snapshotDry = run(['snapshot-take', fixture, '--dry-run']);
ok('快照 dry-run 只签发计划令牌', snapshotDry.code === 0 && Boolean(JSON.parse(snapshotDry.out).applyToken));
ok('快照 dry-run 不写文件', !existsSync(snapshotDir));
const snapshotApply = run(['snapshot-take', fixture, '--apply', '--token', JSON.parse(snapshotDry.out).applyToken]);
ok('快照只有确认执行后才写入', snapshotApply.code === 0 && existsSync(snapshotDir), String(snapshotApply.code));

console.log(fail ? 'CLI_TOKEN_FAILED ' + fail : 'CLI_TOKEN_OK');
process.exitCode = fail ? 1 : 0;
