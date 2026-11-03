// `check risk` 与 `check-risk` 必须是同一个命令、同一种契约形状（评审红 1）。
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  const r = spawnSync(process.execPath, [join(here, 'turnstile.mjs'), ...args], { encoding: 'utf8' });
  const text = (r.stdout || '').slice((r.stdout || '').indexOf('{'), (r.stdout || '').lastIndexOf('}') + 1);
  try { return JSON.parse(text); } catch { return null; }
};
const fixture = join(here, '..', 'tests', 'risk-fixture');
const combined = run(['check', 'risk', fixture, '--json']);
const flat = run(['check-risk', fixture, '--json']);
ok('两种写法都拿到统一契约', Boolean(combined && combined.command && combined.verdict), JSON.stringify(combined && Object.keys(combined).slice(0, 4)));
ok('两种写法的 command 一致', combined && flat && combined.command === flat.command, (combined && combined.command) + ' vs ' + (flat && flat.command));
ok('两种写法的 verdict 一致', combined && flat && combined.verdict === flat.verdict, (combined && combined.verdict) + ' vs ' + (flat && flat.verdict));
ok('组合写法不是原始 JSON（有 summary 人话）', Boolean(combined && typeof combined.summary === 'string' && combined.summary.length > 4), combined && String(combined.summary).slice(0, 40));
console.log(fail ? 'CHECK_ALIAS_FAILED ' + fail : 'CHECK_ALIAS_OK');
process.exitCode = fail ? 1 : 0;
