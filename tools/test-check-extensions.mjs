// 第三方检查器清单：真实 preflight 子进程 + 临时 profile，不读取任何真实环境。
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const preflight = join(root, 'tools', 'preflight.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'turnstile-check-extension-'));
const profile = join(tmp, 'profile');
const scripts = join(tmp, 'scripts');
mkdirSync(profile, { recursive: true });
mkdirSync(scripts, { recursive: true });
writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'check-fixture', version: '1.0.0', dependencies: {}, dsh: { profile: { bundles: [] } } }));
writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n');

const checker = (name, exit, finding) => `console.log(JSON.stringify({ checker: ${JSON.stringify(name)}, findings: ${finding ? JSON.stringify([finding]) : '[]'}, evidence: [process.argv[2]] })); process.exitCode = ${exit};\n`;
writeFileSync(join(scripts, 'pass.mjs'), checker('custom-pass', 0));
writeFileSync(join(scripts, 'fail.mjs'), checker('custom-fail', 6, { severity: 'error', message: 'custom blocker', plugin: 'plug-custom' }));
writeFileSync(join(scripts, 'advisory.mjs'), checker('custom-advisory', 6, { severity: 'warning', message: 'custom warning' }));
const manifest = join(tmp, 'checks.json');
writeFileSync(manifest, JSON.stringify({
  schema: 'turnstile/checks@1',
  checks: [
    { name: 'custom-pass', script: './scripts/pass.mjs' },
    { name: 'custom-fail', script: './scripts/fail.mjs', hint: 'test blocker' },
    { name: 'custom-advisory', script: './scripts/advisory.mjs', advisory: true },
  ],
}));

let failed = 0;
const ok = (name, condition, detail = '') => { console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!condition) failed++; };
function run(args) {
  const r = spawnSync(process.execPath, [preflight, ...args], { cwd: tmp, encoding: 'utf8', timeout: 120000 });
  let data = null;
  try { data = JSON.parse(r.stdout); } catch {}
  return { code: r.status == null ? 1 : r.status, out: String(r.stdout || '') + String(r.stderr || ''), data };
}
const base = ['--checks', manifest, '--no-record', '--no-report', '--json'];

// 清单故意放在 profile 前，同时覆盖参数解析和相对脚本路径。
const pass = run([...base, profile, '--only', 'custom-pass']);
ok('外部检查器通过时闸门通过', pass.code === 0, String(pass.code));
ok('--only 能选择外部检查器', pass.data?.checks?.length === 1 && pass.data.checks[0].name === 'custom-pass');
ok('结果记录外部清单来源', pass.data?.checks?.[0]?.source === manifest);
ok('检查器收到目标 profile', pass.data?.checks?.[0]?.structured === true);

const unifiedRun = spawnSync(process.execPath, [join(root, 'tools', 'turnstile.mjs'), 'gate', ...base.slice(0, 2), profile, '--only', 'custom-pass', '--no-record', '--no-report', '--json'], { cwd: tmp, encoding: 'utf8', timeout: 120000 });
let unified = null;
try { unified = JSON.parse(unifiedRun.stdout); } catch {}
ok('统一 gate 入口真实转发外部检查参数', unifiedRun.status === 0 && unified?.data?.checks?.length === 1 && unified.data.checks[0].name === 'custom-pass', String(unifiedRun.status));

const blocked = run([...base, profile, '--only', 'custom-fail']);
ok('外部检查器非零退出会阻断', blocked.code === 1, String(blocked.code));
ok('阻断清单包含外部检查器', blocked.data?.blocking?.includes('custom-fail') === true);
ok('结构化 finding 原样保留', blocked.data?.checks?.[0]?.findings?.[0]?.message === 'custom blocker');

const advisory = run([...base, profile, '--only', 'custom-advisory']);
ok('建议检查器不阻断闸门', advisory.code === 0 && advisory.data?.result === 'clear', String(advisory.code));
ok('建议检查器仍保留问题状态', advisory.data?.checks?.[0]?.ok === false && advisory.data?.checks?.[0]?.findings?.length === 1);

const badSchema = join(tmp, 'bad-schema.json');
writeFileSync(badSchema, JSON.stringify({ schema: 'wrong', checks: [{ name: 'x', script: './scripts/pass.mjs' }] }));
ok('错误 schema 拒绝执行', run(['--checks', badSchema, profile, '--json']).code === 2);

const duplicate = join(tmp, 'duplicate.json');
writeFileSync(duplicate, JSON.stringify({ schema: 'turnstile/checks@1', checks: [{ name: 'dependency-risk', script: './scripts/pass.mjs' }] }));
ok('外部检查器不能覆盖内置名称', run(['--checks', duplicate, profile, '--json']).code === 2);

const missing = join(tmp, 'missing.json');
writeFileSync(missing, JSON.stringify({ schema: 'turnstile/checks@1', checks: [{ name: 'missing', script: './not-there.mjs' }] }));
ok('脚本缺失时明确拒绝', run(['--checks', missing, profile, '--json']).code === 2);

const malformed = join(tmp, 'malformed.json');
writeFileSync(malformed, '{ nope');
ok(' malformed JSON 明确拒绝'.trim(), run(['--checks', malformed, profile, '--json']).code === 2);

const repeated = join(tmp, 'repeated.json');
writeFileSync(repeated, JSON.stringify({ schema: 'turnstile/checks@1', checks: [
  { name: 'same', script: './scripts/pass.mjs' }, { name: 'same', script: './scripts/pass.mjs' },
] }));
ok('清单内部重名明确拒绝', run(['--checks', repeated, profile, '--json']).code === 2);

const invalidName = join(tmp, 'invalid-name.json');
writeFileSync(invalidName, JSON.stringify({ schema: 'turnstile/checks@1', checks: [{ name: 'Bad Name', script: './scripts/pass.mjs' }] }));
ok('非法检查器名称明确拒绝', run(['--checks', invalidName, profile, '--json']).code === 2);

// 即使 profile 内放了看似自动发现的文件，没有 --checks 也绝不能执行它。
writeFileSync(join(profile, 'turnstile.checks.json'), JSON.stringify({ schema: 'turnstile/checks@1', checks: [{ name: 'custom-fail', script: '../scripts/fail.mjs' }] }));
const noAuto = run([profile, '--only', 'profile-yaml', '--no-record', '--no-report', '--json']);
ok('不自动发现 profile 中的外部代码', noAuto.code === 0 && noAuto.data?.checks?.length === 1 && noAuto.data.checks[0].name === 'profile-yaml');
ok('--checks 缺路径时明确拒绝', run([profile, '--checks', '--json']).code === 2);

console.log(failed ? 'CHECK_EXTENSION_FAILED ' + failed : 'CHECK_EXTENSION_OK 18 checks');
process.exitCode = failed ? 1 : 0;
