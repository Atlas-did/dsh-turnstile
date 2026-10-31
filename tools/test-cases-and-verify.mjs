// C/D：样本捕获、启动自检、fix-plan 步骤文件。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (script, args, env = {}) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(root, 'tools', script), ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 180000 }) }; }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

// C3 样本捕获
const s = mkdtempSync(join(tmpdir(), 'cap-'));
const aa = join(s, 'aa');
mkdirSync(aa, { recursive: true });
writeFileSync(join(aa, 'runtime-1.jsonl'), JSON.stringify([{ source: 'connector', seq: 1, record: { time: '2026-10-31T10:00:00Z', level: 'ERROR', message: "unknown variant `recency_at`" } }]) + '\n');
const corpus = join(s, 'corpus');
const cap = run('capture-case.mjs', ['demo', '--logs', aa, '--plugin-logs', join(s, 'none'), '--corpus', corpus, '--note', '演示']);
ok('样本可冻结', cap.code === 0 && existsSync(join(corpus, 'manifest.json')) && existsSync(join(corpus, 'labels.md')), cap.out.trim().slice(0, 60));
ok('manifest 记了 sha256', /sha256/.test(readFileSync(join(corpus, 'manifest.json'), 'utf8')));
ok('labels 提示写预期结论', /预期诊断结论|复跑/.test(readFileSync(join(corpus, 'labels.md'), 'utf8')));
const diag = run('diagnose.mjs', ['--corpus', corpus]);
ok('冻结样本能被 diagnose 回放', /codex/.test(diag.out), diag.out.split('\n').slice(-2).join(' '));

// D2 启动自检
const sb = mkdtempSync(join(tmpdir(), 'vb-'));
const empty = run('sandbox-verify.mjs', ['--root', sb]);
ok('没有 home 时拒绝', empty.code === 1 && /还不是沙盒/.test(empty.out), empty.out.split('\n')[0]);
const mk = run('new-sandbox.mjs', ['--root', join(sb, 'ok'), '--profiles', 'mini', '--port', '19999', '--dsh-bin', join(root, 'tools', 'diagnose.mjs')]);
ok('new-sandbox 产出 profile', existsSync(join(sb, 'ok', 'home', 'profiles', 'mini', 'package.json')));
const good = run('sandbox-verify.mjs', ['--root', join(sb, 'ok'), '--port', '19999', '--dsh-bin', join(root, 'tools', 'diagnose.mjs')]);
ok('合格沙盒判定为可启动', /可以启动$/.test(good.out.trim()) || /结论：可以启动/.test(good.out), good.out.trim().split('\n').slice(-2).join(' '));
// 空 bundles 必须被抓到
const pkgPath = join(sb, 'ok', 'home', 'profiles', 'mini', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dsh.profile.bundles = [];
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
const bad = run('sandbox-verify.mjs', ['--root', join(sb, 'ok'), '--port', '19999', '--dsh-bin', join(root, 'tools', 'diagnose.mjs')]);
ok('空 bundles 被判为不能启动', bad.code === 1 && /不能启动/.test(bad.out), bad.out.split('\n').filter((l) => l.includes('bundles')).join(' '));

// C2 fix-plan
const plan = join(s, 'plan.md');
const fp = run('diagnose.mjs', ['--corpus', join(root, 'tests', 'corpus', '2026-10-31'), '--fix-plan', plan]);
const planText = existsSync(plan) ? readFileSync(plan, 'utf8') : '';
ok('fix-plan 生成步骤文件', planText.length > 100 && /做什么/.test(planText) && /回滚/.test(planText));
ok('fix-plan 带验证命令', /diagnose.mjs --live/.test(planText));

console.log(fail ? 'CASES_TEST_FAILED ' + fail : 'CASES_TEST_OK');
process.exitCode = fail ? 1 : 0;
