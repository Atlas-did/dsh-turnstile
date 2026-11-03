// 试装结论映射：无记录 unknown、失败 fail(1)、仅静态 warn(2)、有宿主证据 ok(0)。
import { trialVerdict, LADDER } from './lib/trial-verdict.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const none = trialVerdict({ latest: null, hostLatest: null, hostCheck: { ok: false, errors: [] }, file: 'f' });
ok('没有记录 → unknown / exit 0', none.verdict === 'unknown' && none.claim === 'unknown' && none.exitCode === 0, none.summary);
const failed = trialVerdict({ latest: { verdict: 'fail', note: '装不上' }, hostLatest: null, hostCheck: { ok: false }, file: 'f' });
ok('失败 → fail / exit 1', failed.verdict === 'fail' && failed.exitCode === 1 && /装不上/.test(failed.summary));
const staticOnly = trialVerdict({ latest: { verdict: 'static-only' }, hostLatest: null, hostCheck: { ok: false }, file: 'f' });
ok('仅静态 → warn / exit 2 且不声称已加载', staticOnly.verdict === 'warn' && staticOnly.exitCode === 2 && /未验证/.test(staticOnly.summary) && staticOnly.claim === 'static-only');
const legacy = trialVerdict({ latest: { verdict: 'static-pass' }, hostLatest: null, hostCheck: { ok: false }, file: 'f' });
ok('旧的 static-pass 也落到同一句（措辞变了结论不散）', legacy.verdict === 'warn' && /仅静态通过/.test(legacy.summary));
const loaded = trialVerdict({ latest: { verdict: 'routable', target: 'plug-a' }, hostLatest: { at: 'T', evidence: { route: { path: '/x' } } }, hostCheck: { ok: true }, file: 'f' });
ok('有宿主证据 → ok / exit 0 且 claim 取六级词', loaded.verdict === 'ok' && loaded.exitCode === 0 && loaded.claim === 'routable' && /真实宿主/.test(loaded.summary));
const badEvidence = trialVerdict({ latest: { verdict: 'loaded', target: 'plug-a' }, hostLatest: { at: 'T', evidence: {} }, hostCheck: { ok: false, errors: ['太旧'] }, file: 'f' });
ok('宿主证据未过校验 → warn 且说明原因', badEvidence.verdict === 'warn' && /太旧/.test(badEvidence.summary));
ok('六级词表是封闭集合', LADDER.length === 5 && LADDER[0] === 'static-only');
console.log(fail ? 'TRIAL_VERDICT_FAILED ' + fail : 'TRIAL_VERDICT_OK');
process.exitCode = fail ? 1 : 0;
