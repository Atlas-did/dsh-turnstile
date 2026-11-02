// 令牌存储失败关闭（C-04）：坏存储不能被当成空集合，两个进程不能同时消费同一个 token。
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
process.env.DSH_TURNSTILE_STATE = mkdtempSync(join(tmpdir(), 'token-store-'));
const mod = await import('../tools/lib/apply-token.mjs');

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const issued = mod.issue('manage-disable', { profile: 'p1' });
ok('正常签发', Boolean(issued.token), issued.reason || '');
const store = process.env.DSH_TURNSTILE_STATE;
writeFileSync(join(store, 'apply-tokens.json'), '{not json');
const brokenVerify = mod.verify(issued.token, 'manage-disable', { profile: 'p1' });
ok('存储损坏时校验失败关闭（不按空集合放行）', brokenVerify.ok === false && /拒绝/.test(brokenVerify.reason || ''), brokenVerify.reason);
const brokenIssue = mod.issue('manage-disable', { profile: 'p1' });
ok('存储损坏时不再签发新令牌', brokenIssue.ok === false && Boolean(brokenIssue.reason), brokenIssue.reason);
mod._resetForTests();
const reissued = mod.issue('manage-disable', { profile: 'p1' });
ok('重置后可继续', Boolean(reissued.token), reissued.reason || '');
const first = mod.verify(reissued.token, 'manage-disable', { profile: 'p1' });
const second = mod.verify(reissued.token, 'manage-disable', { profile: 'p1' });
ok('同一令牌只能消费一次', first.ok === true && second.ok === false, second.reason);
writeFileSync(join(store, 'apply-tokens.json.lock'), '99999');
const locked = mod.issue('manage-disable', { profile: 'p1' });
ok('锁被占用时失败关闭（不排队硬写）', locked.ok === false && /另一个进程/.test(locked.reason || ''), locked.reason);
try { rmSync(join(store, 'apply-tokens.json.lock'), { force: true }); } catch {}

// 目录解析：没有 DSH_TURNSTILE_STATE 时跟着 DSH_HOME 走（与宿主一致），不再默认写系统临时目录
const homeDir = mkdtempSync(join(tmpdir(), 'home-'))
delete process.env.DSH_TURNSTILE_STATE;
process.env.DSH_HOME = homeDir;
mod.issue('manage-disable', { profile: 'p2' });
ok('令牌跟着 DSH_HOME 走', existsSync(join(homeDir, 'turnstile-state', 'apply-tokens.json')));
process.env.DSH_TURNSTILE_STATE = store;
rmSync(homeDir, { recursive: true, force: true });

rmSync(store, { recursive: true, force: true });
console.log(fail ? 'TOKEN_STORE_FAILED ' + fail : 'TOKEN_STORE_OK');
process.exitCode = fail ? 1 : 0;
