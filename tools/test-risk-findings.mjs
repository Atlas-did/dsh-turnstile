// 方案 03-A：每条 finding 必须带稳定规则、对象、位置、证据强度与推翻条件。
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [join(here, 'risk.mjs'), ...args, '--json']);
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => { let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch {} resolve({ code, j }); });
});
const red = await run([join(here, '..', 'tests', 'risk-fixture')]);
const f = (red.j && red.j.findings || [])[0] || {};
ok('finding 有稳定 ruleId', /^risk\./.test(f.ruleId || ''), f.ruleId);
ok('finding 有可定位对象', f.subject && f.subject.kind === 'plugin' && Boolean(f.subject.id), JSON.stringify(f.subject));
ok('finding 有 locator.file', Boolean(f.locator && f.locator.file), JSON.stringify(f.locator));
ok('locator 不编造行号', f.locator && f.locator.line === null, String(f.locator && f.locator.line));
ok('finding 标明证据强度', f.strength === 'static-ast', String(f.strength));
ok('finding 给了推翻条件', typeof f.falsifier === 'string' && f.falsifier.length > 8, String(f.falsifier).slice(0, 30));
ok('severity 用 error/warning 而不是内部色阶', ['error', 'warning'].includes(f.severity), String(f.severity));
// 成对夹具：同一条规则在「声明了依赖」的插件上必须是绿的（否则规则只会报警）
const clean = await run([join(here, '..', 'tests', 'risk-fixture-clean')]);
ok('负夹具：声明了官方 scope 的插件不报警', clean.j && clean.j.status === 'pass' && (clean.j.findings || []).length === 0, JSON.stringify(clean.j && clean.j.findings));
console.log(fail ? 'RISK_FINDINGS_FAILED ' + fail : 'RISK_FINDINGS_OK');
process.exitCode = fail ? 1 : 0;