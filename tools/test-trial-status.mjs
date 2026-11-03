// trial-status：只解释已有证据；static-pass 永远不能变成真实宿主加载成功。
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runCommand } from './lib/commands.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'trial-status.mjs');
const root = mkdtempSync(join(tmpdir(), 'trial-status-'));
const profile = join(root, 'home', 'profiles', 'mini');
const state = join(root, 'home', 'turnstile-state');
// 状态根现在由统一解析器决定：测试要显式清掉 DSH_HOME，才能验证「profile 相对」这条兜底
if (process.env.DSH_TURNSTILE_STATE === undefined) delete process.env.DSH_HOME;
const journal = join(state, 'lab-journal.jsonl');
mkdirSync(profile, { recursive: true });
mkdirSync(state, { recursive: true });
let failed = 0;
let checks = 0;
const ok = (name, condition, detail = '') => {
  checks++;
  console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : ''));
  if (!condition) failed++;
};
const run = () => {
  const r = spawnSync(process.execPath, [script, profile, '--json'], { encoding: 'utf8' });
  let data = null;
  try { data = JSON.parse(r.stdout); } catch {}
  return { code: r.status, data, stderr: r.stderr };
};
const record = (value) => writeFileSync(journal, value + '\n');

let r = run();
ok('无记录返回 unknown', r.code === 3 && r.data?.verdict === 'unknown' && r.data.ok === false, String(r.code));
ok('无记录明确说没有证据', /还没有试装记录/.test(r.data?.summary || ''));

record('{broken json\n' + JSON.stringify({ kind: 'other', verdict: 'ok' }));
r = run();
ok('损坏行与非试装记录不算证据', r.code === 3 && r.data?.latest === null);

record(JSON.stringify({ kind: 'trial', verdict: 'static-pass', at: '2026-11-01T00:00:00Z', note: 'fixture only' }));
r = run();
ok('static-pass 是 warn 且 exit 2', r.code === 2 && r.data?.verdict === 'warn' && r.data.ok === false, String(r.code));
ok('static-pass 不声称插件加载成功', /静态通过/.test(r.data?.summary || '') && /加载未验证/.test(r.data?.summary || ''));
ok('下一步仍要求真实宿主重启与路由检查', /重启真实宿主/.test(r.data?.next?.[0]?.reason || '') && /目标路由/.test(r.data?.next?.[0]?.reason || ''));

record(JSON.stringify({ kind: 'trial', verdict: 'fail', at: '2026-11-01T00:01:00Z', note: 'route missing' }));
r = run();
ok('失败记录返回 fail 且 exit 1', r.code === 1 && r.data?.verdict === 'fail' && r.data.ok === false);
ok('失败原因来自 journal', /route missing/.test(r.data?.summary || ''));

record(JSON.stringify({ kind: 'trial', verdict: 'blocked', at: '2026-11-01T00:02:00Z', note: 'snapshot failed' }));
r = run();
ok('blocked 同样不能显示通过', r.code === 1 && r.data?.verdict === 'fail' && /snapshot failed/.test(r.data?.summary || ''));

record(JSON.stringify({ kind: 'trial', verdict: 'static-pass', at: '2026-11-01T00:03:00Z' }) + '\n' + JSON.stringify({ kind: 'trial', verdict: 'fail', at: '2026-11-01T00:04:00Z', note: 'latest failed' }));
r = run();
ok('只采用最近一次有效 trial', r.data?.latest?.note === 'latest failed' && r.code === 1);

process.env.DSH_TURNSTILE_STATE = state;
record(JSON.stringify({ kind: 'trial', verdict: 'static-pass', at: '2026-11-01T00:05:00Z' }));
const unified = runCommand('trial-status', { profile });
ok('统一命令注册表可运行 trial-status', unified.command === 'trial-status' && unified.exitCode === 2, String(unified.exitCode));
ok('统一契约保留原始证据和警示', unified.data?.latest?.verdict === 'static-pass' && /加载未验证/.test(unified.summary));
delete process.env.DSH_TURNSTILE_STATE;

console.log(failed ? `TRIAL_STATUS_FAILED ${failed}` : `TRIAL_STATUS_OK ${checks} checks`);
process.exitCode = failed ? 1 : 0;
