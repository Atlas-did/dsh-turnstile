// 真实宿主证据：结构校验、journal 关联与防误报；全部使用临时夹具，不启动真实 mini。
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateHostEvidence } from './lib/host-evidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'host-evidence-'));
const profile = join(root, 'home', 'profiles', 'mini');
const state = join(root, 'home', 'turnstile-state');
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
const valid = () => ({
  schema: 'turnstile/host-evidence@1',
  scope: 'real-dsh-host',
  realDsh: true,
  target: 'fixture-page',
  profile: resolve(profile),
  capturedAt: '2026-11-01T00:02:00Z',
  host: {
    kind: 'dsh',
    runtimeVersion: '0.2.1-rc.3',
    runtimeBin: resolve(root, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    processId: 4321,
    bootId: 'boot-after',
  },
  restart: { observed: true, beforeBootId: 'boot-before', afterBootId: 'boot-after' },
  installation: { packageJson: true, bundleListed: true },
  route: { path: '/fixture-page', status: 200, bodyBytes: 1234, bodySha256: 'a'.repeat(64) },
});
const run = (script, args) => {
  const r = spawnSync(process.execPath, [join(here, script), ...args], { encoding: 'utf8' });
  let data = null;
  try { data = JSON.parse(r.stdout); } catch {}
  return { code: r.status, data, stdout: r.stdout, stderr: r.stderr };
};

ok('完整真实宿主证据通过结构校验', validateHostEvidence(valid(), { target: 'fixture-page', profile, trialAt: '2026-11-01T00:00:00Z' }).ok);
for (const [name, mutate, expected] of [
  ['隔离宿主不能冒称真实宿主', (e) => { e.scope = 'isolated-module-host'; e.realDsh = false; }, /隔离宿主/],
  ['必须观察到重启', (e) => { e.restart.observed = false; }, /观察到宿主重启/],
  ['重启前后 bootId 必须不同', (e) => { e.restart.beforeBootId = 'boot-after'; }, /必须不同/],
  ['重启结果必须对应当前宿主', (e) => { e.host.bootId = 'other'; }, /与宿主证据一致/],
  ['孤立 HTTP 非 200 不能通过', (e) => { e.route.status = 201; }, /HTTP 200/],
  ['空响应不能证明页面加载', (e) => { e.route.bodyBytes = 0; }, /非空内容/],
  ['响应必须带内容哈希', (e) => { e.route.bodySha256 = ''; }, /SHA-256/],
  ['必须确认 bundles', (e) => { e.installation.bundleListed = false; }, /bundles/],
  ['目标插件必须一致', (e) => { e.target = 'other'; }, /目标不一致/],
  ['profile 必须一致', (e) => { e.profile = resolve(root, 'other'); }, /profile 与本次试装不一致/],
  ['旧证据不能证明新试装', (e) => { e.capturedAt = '2026-11-01T00:00:00Z'; }, /晚于最近一次试装/],
]) {
  const evidence = valid();
  mutate(evidence);
  const result = validateHostEvidence(evidence, { target: 'fixture-page', profile, trialAt: '2026-11-01T00:00:00Z' });
  const messages = Array.isArray(expected) ? expected : [expected];
  ok(name, !result.ok && messages.every((m) => result.errors.some((e) => m.test(e))), result.errors.join(' | '));
}

const file = join(root, 'evidence.json');
writeFileSync(file, JSON.stringify(valid()));
const unified = run('turnstile.mjs', ['host-evidence', file, '--json']);
ok('统一 CLI 可校验宿主证据', unified.code === 0 && unified.data?.verdict === 'ok' && unified.data?.command === 'host-evidence', unified.data?.summary);
writeFileSync(journal, JSON.stringify({ kind: 'trial', target: 'fixture-page', verdict: 'static-pass', at: '2026-11-01T00:00:00Z', note: 'fixture' }) + '\n');
let r = run('host-evidence.mjs', [file, '--record', '--state', state, '--json']);
ok('有效证据可写入 journal', r.code === 0 && r.data?.recorded === true && existsSync(journal), String(r.code));
r = run('trial-status.mjs', [profile, '--json']);
ok('trial-status 关联后显示真实加载证据通过', r.code === 0 && r.data?.verdict === 'ok' && r.data.ok === true && r.data.hostEvidence?.valid === true, r.data?.summary);
ok('通过结论包含路由与重启范围', /真实宿主重启/.test(r.data?.summary || '') && /\/fixture-page=200/.test(r.data?.summary || ''));

const beforeInvalid = readFileSync(journal, 'utf8');
const invalid = valid();
invalid.restart.observed = false;
writeFileSync(file, JSON.stringify(invalid));
r = run('host-evidence.mjs', [file, '--record', '--state', state, '--json']);
ok('无效证据拒绝记录且不改 journal', r.code === 1 && r.data?.recorded === false && readFileSync(journal, 'utf8') === beforeInvalid, String(r.code));

writeFileSync(file, JSON.stringify(valid()));
r = run('host-evidence.mjs', [file, '--record', '--state', state, '--json']);
ok('新 trial 之前的证据仍会被关联', r.code === 0);
writeFileSync(journal, readFileSync(journal, 'utf8') + JSON.stringify({ kind: 'trial', target: 'fixture-page', verdict: 'static-pass', at: '2026-11-01T00:03:00Z', note: 'newer trial' }) + '\n');
r = run('trial-status.mjs', [profile, '--json']);
ok('新试装出现后旧宿主证据自动失效', r.code === 2 && r.data?.verdict === 'warn' && /晚于最近一次试装/.test(r.data?.summary || ''), r.data?.summary);

console.log(failed ? `HOST_EVIDENCE_FAILED ${failed}` : `HOST_EVIDENCE_OK ${checks} checks`);
process.exitCode = failed ? 1 : 0;
