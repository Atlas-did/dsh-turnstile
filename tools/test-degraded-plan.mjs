// drySafe:false 的计划必须标出来：它没跑底层脚本，所以不能当成“预演过”。
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  const r = spawnSync(process.execPath, [join(here, 'turnstile.mjs'), ...args], { encoding: 'utf8', timeout: 120000 });
  const s = r.stdout || '';
  try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return null; }
};
const plan = run(['snapshot-take', join(here, '..', 'tests', 'console-fixture'), '--dry-run', '--json']);
ok('drySafe:false 的 dry-run 返回计划', Boolean(plan && plan.dryRun === true), JSON.stringify(plan && Object.keys(plan).slice(0, 5)));
ok('计划标了 degraded 与原因', Boolean(plan && plan.degraded === true && /drySafe:false/.test(plan.degradedReason || '')), plan && plan.degradedReason);
ok('计划里只有“将执行”，没有执行结果', Boolean(plan && Array.isArray(plan.plan) && plan.plan.every((x) => /^将执行：/.test(x))), JSON.stringify(plan && plan.plan));
console.log(fail ? 'DEGRADED_PLAN_FAILED ' + fail : 'DEGRADED_PLAN_OK');
process.exitCode = fail ? 1 : 0;
