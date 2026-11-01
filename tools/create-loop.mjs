#!/usr/bin/env node
// 创作闭环编排：新建（或从页面导出）→ 在 mini 试装 → 六级验证 → 给结论。
// 任一段失败就停，并说明停在哪一段、为什么。
//
// usage:
//   node tools/create-loop.mjs <name> [--dir <parent>] [--template ui-page|route]
//        [--from-page <page.json>] [--mini <mini-root>] [--keep] [--dry-run] [--json]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const name = argv.find((a) => !a.startsWith('--') && a !== val('--dir') && a !== val('--template') && a !== val('--from-page') && a !== val('--mini'));
if (!name) { console.error('usage: node tools/create-loop.mjs <name> [--dir <parent>] [--from-page <page.json>] [--mini <root>] [--keep]'); process.exit(2); }

const parent = resolve(val('--dir') || '.');
const outDir = join(parent, name);
const fromPage = val('--from-page');
const mini = val('--mini') || process.env.MINI_HOME || '';
const steps = [];
const step = (id, status, detail) => { steps.push({ id, status, detail: detail || '' }); return status; };

function runNode(script, args, timeout = 600000) {
  try { return { code: 0, out: execFileSync(process.execPath, [join(here, script), ...args], { encoding: 'utf8', timeout }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
}

const plan = fromPage
  ? ['1. 从页面导出插件：' + fromPage + ' → ' + outDir, '2. 在 mini 试装并做六级验证', '3. 给结论（claim）']
  : ['1. 新建插件骨架：' + name + ' → ' + outDir, '2. 在 mini 试装并做六级验证', '3. 给结论（claim）'];

if (has('--dry-run')) {
  const out = { ok: true, dryRun: true, name, dir: outDir, fromPage: fromPage || null, mini: mini || null, plan };
  if (has('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
  console.log('将执行：'); for (const l of plan) console.log('  ' + l);
  process.exit(0);
}

// 段 1：产物
let made;
if (fromPage) {
  made = runNode('builder-export.mjs', [fromPage, outDir, '--name', name]);
} else {
  const tpl = val('--template') || 'ui-page';
  made = runNode('new-plugin.mjs', [name, '--dir', parent, '--template', tpl]);
}
if (made.code !== 0) {
  step('create', 'fail', (made.out.trim().split('\n').pop() || '').slice(0, 160));
  report(false, 'failed', '新建/导出失败：' + (made.out.trim().split('\n').pop() || ''));
}
step('create', 'pass', outDir);

// 段 2：试装 + 六级
if (!mini) {
  step('trial', 'skip', '没给 --mini，只能验到文件层');
  report(true, 'static-only', '插件已生成，但没连 mini，只证明文件写了，不能认为可用。');
}
const trialArgs = [join(mini, 'home', 'profiles', 'mini'), outDir, '--json', '--mini', mini];
if (has('--keep')) trialArgs.push('--keep');
const trial = runNode('sandbox-trial.mjs', trialArgs, 900000);
let t = null;
try { t = JSON.parse(trial.out.slice(trial.out.indexOf('{'), trial.out.lastIndexOf('}') + 1)); } catch { t = null; }
if (!t) {
  step('trial', 'fail', (trial.out.trim().split('\n').pop() || '').slice(0, 160));
  report(false, 'failed', '试装阶段没有返回可解析结果');
}
const claim = t.claim || (t.ok ? 'static-only' : 'failed');
step('trial', t.ok ? 'pass' : 'fail', claim);
report(Boolean(t.ok), claim, t.claimText || '');

function report(ok, claim, claimText) {
  const out = { ok, claim, claimText, name, dir: outDir, mini: mini || null, steps };
  out.next = claim === 'verified-with-regression' ? [] : [{ label: '看试装明细', command: 'node tools/sandbox-trial.mjs <mini-profile> ' + outDir + ' --keep' + (mini ? ' --mini ' + mini : ''), mutating: false, reason: '当前结论：' + claim }];
  if (has('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(ok ? 0 : 1); }
  for (const s of steps) console.log('  ' + (s.status === 'pass' ? '✓' : s.status === 'skip' ? '·' : '✗') + ' ' + s.id.padEnd(8) + ' ' + s.status + '  ' + s.detail);
  console.log('');
  console.log('结论（' + claim + '）：' + claimText);
  process.exit(ok ? 0 : 1);
  return out;
}