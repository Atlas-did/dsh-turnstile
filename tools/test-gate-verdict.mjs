// 门禁阻断裁决：advisory 的失败不阻断，普通失败阻断，通过项永不阻断。
import { blockingOf } from './lib/gate-verdict.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const selected = [{ name: 'gate-engines', advisory: true }, { name: 'gate-ports', advisory: false }];
const advisoryFail = blockingOf({ results: [{ name: 'gate-engines', ok: false }], selected });
ok('advisory 失败不阻断', advisoryFail.blocked === false && advisoryFail.code === 0 && advisoryFail.advisoryFailures.length === 1, JSON.stringify({ b: advisoryFail.blocked, c: advisoryFail.code }));
const realFail = blockingOf({ results: [{ name: 'gate-ports', ok: false }], selected });
ok('普通失败阻断且 exit 1', realFail.blocked === true && realFail.code === 1);
const passing = blockingOf({ results: [{ name: 'gate-ports', ok: true }], selected });
ok('通过项不阻断', passing.blocked === false && passing.blocking.length === 0);
const both = blockingOf({ results: [{ name: 'gate-engines', ok: false }, { name: 'gate-ports', ok: false }], selected });
ok('混合时只把普通失败算作阻断', both.blocking.length === 1 && both.advisoryFailures.length === 1 && both.code === 1);
const unknownCheck = blockingOf({ results: [{ name: 'not-in-selected', ok: false }], selected });
ok('未在清单里的失败按阻断处理（不能被沉默）', unknownCheck.blocked === true);
console.log(fail ? 'GATE_VERDICT_FAILED ' + fail : 'GATE_VERDICT_OK');
process.exitCode = fail ? 1 : 0;
