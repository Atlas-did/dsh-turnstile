// 冲突裁决：stale 线索不阻断、未知 kind 按阻断处理、severity 与 kind 对齐。
import { verdictOfRows, severityOf } from './lib/conflict-verdict.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const only = verdictOfRows([{ kind: 'ctx-assign-stale' }, { kind: 'dep-divergence' }]);
ok('只有 stale 线索 → 不阻断', only.code === 0 && only.verdict === 'ok' && only.hints === 2, JSON.stringify(only));
const real = verdictOfRows([{ kind: 'ctx-assign' }]);
ok('真实冲突 → exit 6 / fail', real.code === 6 && real.verdict === 'fail' && real.blocking === 1, JSON.stringify(real));
const mixed = verdictOfRows([{ kind: 'ctx-assign' }, { kind: 'ctx-assign-stale' }]);
ok('混合时以阻断为准', mixed.code === 6 && mixed.hints === 1, JSON.stringify(mixed));
const unknown = verdictOfRows([{ kind: 'something-new' }]);
ok('未知 kind 也阻断（不认识的东西不能当提示放过）', unknown.code === 6 && unknown.blocking === 1, JSON.stringify(unknown));
ok('severity 与 kind 对齐', severityOf('ctx-assign') === 'error' && severityOf('ctx-assign-stale') === 'warning');
ok('空输入是 ok', verdictOfRows([]).code === 0);
console.log(fail ? 'CONFLICT_VERDICT_FAILED ' + fail : 'CONFLICT_VERDICT_OK');
process.exitCode = fail ? 1 : 0;
