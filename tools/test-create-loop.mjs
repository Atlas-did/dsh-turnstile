// create-loop：编排「新建/导出 → 试装 → 六级验证」，任一段失败就停并说明停在哪。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'tools', 'create-loop.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => { try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 900000 }) }; } catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; } };
const json = (o) => { const s = o.out; return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };

const parent = mkdtempSync(join(tmpdir(), 'createloop-'));

// 1) dry-run：只列计划，不落盘
const dry = run(['demo-x', '--dir', parent, '--dry-run', '--json']);
const dj = json(dry);
ok('dry-run 三段计划', dj.plan.length === 3 && dj.dryRun === true, dj.plan.join(' | ').slice(0, 60));
ok('dry-run 不写盘', !existsSync(join(parent, 'demo-x')));

// 2) 没给 --mini：允许成功，但结论只能是 static-only
const noMini = json(run(['demo-y', '--dir', parent, '--json']));
ok('没 mini 时结论是 static-only', noMini.claim === 'static-only', noMini.claim);
ok('没 mini 时明说不能认为可用', /不能认为可用/.test(noMini.claimText), noMini.claimText.slice(0, 24));
ok('没 mini 时 trial 段标记 skip', noMini.steps.some((s) => s.id === 'trial' && s.status === 'skip'));

// 3) 失败要停在第一段并给出原因
const bad = run(['Bad_Name', '--dir', parent, '--json']);
ok('非法包名：退出码 1', bad.code === 1, String(bad.code));
const bj = json(bad);
ok('失败停在 create 段', bj.steps[0].id === 'create' && bj.steps[0].status === 'fail');
ok('失败给出原因文本', bj.claimText.length > 6 && /失败/.test(bj.claimText), bj.claimText.slice(0, 30));
ok('失败时 next 指向可复查的命令', (bj.next || []).length === 1);

rmSync(parent, { recursive: true, force: true });
console.log(fail ? 'CREATE_LOOP_FAILED ' + fail : 'CREATE_LOOP_OK');
process.exitCode = fail ? 1 : 0;