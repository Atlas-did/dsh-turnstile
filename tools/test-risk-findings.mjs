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

// 基线差异（方案 03-D）：同一规则、同一对象 → 稳定键；新增/消失要能区分
const os = await import('node:os');
const fs = await import('node:fs');
const base = join(os.tmpdir(), 'risk-baseline-' + Date.now() + '.json');
await run([join(here, '..', 'tests', 'risk-fixture'), '--save-baseline', base]);
ok('基线文件写出', fs.existsSync(base));
const same = await run([join(here, '..', 'tests', 'risk-fixture'), '--baseline', base]);
ok('对同一份结果：没有任何新增', same.j && same.j.delta && same.j.delta.added.length === 0, JSON.stringify(same.j && same.j.delta));
ok('对同一份结果：仍存在的项被列出', same.j && same.j.delta && same.j.delta.still.length > 0, String(same.j && same.j.delta && same.j.delta.still.length));
const cleanBase = await run([join(here, '..', 'tests', 'risk-fixture-clean'), '--baseline', base]);
ok('换成干净夹具：旧问题显示为消失', cleanBase.j && cleanBase.j.delta && cleanBase.j.delta.resolved.length > 0, JSON.stringify(cleanBase.j && cleanBase.j.delta));
try { fs.unlinkSync(base); } catch {}
// --save：控制台读的「上次扫描」必须带时间戳和差异，不能只有一堆 finding
const saved = join(os.tmpdir(), 'risk-save-' + Date.now() + '.json');
await run([join(here, '..', 'tests', 'risk-fixture'), '--save', saved]);
const sj = JSON.parse(fs.readFileSync(saved, 'utf8'));
ok('--save 写出控制台快照', typeof sj.at === 'string' && Array.isArray(sj.findings) && sj.findings.length > 0, String(sj.findings && sj.findings.length));
ok('--save 不编造基线差异（没有基线就是 null）', sj.delta === null);
try { fs.unlinkSync(saved); } catch {}
console.log(fail ? 'RISK_FINDINGS_FAILED ' + fail : 'RISK_FINDINGS_OK');
process.exitCode = fail ? 1 : 0;