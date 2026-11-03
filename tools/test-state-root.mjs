// 状态根解析：五级优先级各一条，且必须能说出「这份状态是哪条规则来的」。
import { resolveStateDir, describeStateDir } from './lib/state-root.mjs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const profile = join(tmpdir(), 'home', 'profiles', 'desktop');
ok('显式参数优先', resolveStateDir({ explicit: 'C:/x/state', env: { DSH_TURNSTILE_STATE: 'C:/y' } }) === resolve('C:/x/state'));
ok('DSH_TURNSTILE_STATE 次之', resolveStateDir({ env: { DSH_TURNSTILE_STATE: 'C:/y/state', DSH_HOME: 'C:/h' } }) === resolve('C:/y/state'));
ok('再是 DSH_HOME/turnstile-state', resolveStateDir({ env: { DSH_HOME: 'C:/h' } }) === join(resolve('C:/h'), 'turnstile-state'));
ok('没有环境变量时按 profile 相对布局', resolveStateDir({ env: {}, profileDir: profile }) === resolve(join(profile, '..', '..', 'turnstile-state')));
ok('什么都没有才退到临时目录', resolveStateDir({ env: {} }) === join(tmpdir(), 'turnstile-state'));
const d = describeStateDir('X', { env: { DSH_HOME: 'C:/h' } });
ok('能说出解析来源', d.source === 'DSH_HOME' && d.reliable === true, JSON.stringify(d));
const t = describeStateDir('X', { env: {} });
ok('临时目录兜底被标成不可靠', t.source === 'tmp-fallback' && t.reliable === false, JSON.stringify(t));
console.log(fail ? 'STATE_ROOT_FAILED ' + fail : 'STATE_ROOT_OK');
process.exitCode = fail ? 1 : 0;
