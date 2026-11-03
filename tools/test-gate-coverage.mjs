// 总闸门的覆盖范围（讲解 §5）：跳过项必须有名字，不能只报「通过」。
import { spawnSync } from 'node:child_process';
import { shapeReport } from './lib/report.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const r = spawnSync(process.execPath, [join(here, 'preflight.mjs'), join(here, '..', 'tests', 'console-fixture'), '--json'], { encoding: 'utf8', timeout: 180000 });
const text = (r.stdout || '').slice((r.stdout || '').indexOf('{'), (r.stdout || '').lastIndexOf('}') + 1);
let j = null; try { j = JSON.parse(text); } catch {}
ok('gate 报告带 coverage', Boolean(j && j.coverage && typeof j.coverage.total === 'number'), JSON.stringify(j && j.coverage));
ok('coverage 把通过/跳过/失败分开', Boolean(j && ['passed', 'skipped', 'failed'].every((k) => typeof j.coverage[k] === 'number')));
ok('skipped 有原因清单', Boolean(j && Array.isArray(j.coverage.reasons)));
ok('result 只有三种取值', Boolean(j && ['clear', 'incomplete', 'blocked'].includes(j.result)), j && j.result);
// 评审 v3 §3.1：底层 result=incomplete 时，统一入口不能再说「通过」
const shaped = shapeReport({ command: 'gate', exitCode: 0, parsed: { coverage: { total: 12, passed: 11, skipped: 1, failed: 0, reasons: ['profile-yaml: missing-dependency'] } } });
ok('统一入口不再把「有检查没跑」说成通过', shaped.verdict === 'unknown' && /未跑的不算通过/.test(shaped.summary), shaped.verdict + ' | ' + shaped.summary);
const clean = shapeReport({ command: 'gate', exitCode: 0, parsed: { coverage: { total: 12, passed: 12, skipped: 0, failed: 0, reasons: [] } } });
ok('全部跑完时仍然是 ok', clean.verdict === 'ok', clean.verdict);

console.log(fail ? 'GATE_COVERAGE_FAILED ' + fail : 'GATE_COVERAGE_OK');
process.exitCode = fail ? 1 : 0;
