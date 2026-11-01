// P0-2 行为夹具：验收判定不能只看 L2。
import { judgeVerify, judgeAcceptance } from './lib/acceptance.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const L = (statuses) => Object.entries(statuses).map(([level, status]) => ({ level, status, evidence: [status === 'pass' ? 'ok' : 'route 404'] }));
const ALL = { L0: 'pass', L1: 'pass', L2: 'pass', L3: 'pass', L4: 'pass', L5: 'pass' };

ok('六层全 pass + claim 达标 → 通过', judgeVerify({ ok: true, claim: 'verified-with-regression', levels: L(ALL) }).ok);

const l3fail = judgeVerify({ ok: true, claim: 'verified-with-regression', levels: L({ ...ALL, L3: 'fail' }) });
ok('L2 pass 但 L3 fail → 不通过', !l3fail.ok, l3fail.reason);

const l4unknown = judgeVerify({ ok: true, claim: 'verified', levels: L({ ...ALL, L4: 'unknown' }) });
ok('L4 unknown → 不通过', !l4unknown.ok, l4unknown.reason);

const l5fail = judgeVerify({ ok: true, claim: 'verified', levels: L({ ...ALL, L5: 'fail' }) });
ok('L5 fail → 不通过', !l5fail.ok, l5fail.reason);

const claimLow = judgeVerify({ ok: true, claim: 'verified', levels: L(ALL) });
ok('六层全 pass 但 claim 不是 verified-with-regression → 不通过', !claimLow.ok, claimLow.reason);

const missing = judgeVerify({ ok: true, claim: 'verified-with-regression', levels: L({ L0: 'pass', L1: 'pass' }) });
ok('缺层级 → 不通过', !missing.ok, missing.reason);

ok('整体验收：任一步失败即失败', !judgeAcceptance([{ id: 'a', ok: true }, { id: 'b', ok: false }]).ok);
ok('整体验收：全通过才算过', judgeAcceptance([{ id: 'a', ok: true }]).ok);

console.log(fail ? 'ACCEPTANCE_JUDGE_FAILED ' + fail : 'ACCEPTANCE_JUDGE_OK');
process.exitCode = fail ? 1 : 0;