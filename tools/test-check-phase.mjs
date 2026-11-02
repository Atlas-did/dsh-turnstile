// 检查阶段契约：六种状态各有名字，检查器自身失败不能冒充目标未通过。
import { normalizeCheckResult, summarizePhases, PHASES, STATES } from './lib/check-phase.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('阶段枚举是封闭集合', PHASES.length === 6 && STATES.length === 6);
const base = { checker: 'engines', phase: 'manifest', subjectId: 'plugin:plug-a', inputHash: 'h1' };

const err = normalizeCheckResult({ ...base, threw: new Error('boom') });
ok('检查器抛错 → checker-error 且带错误文本', err.state === 'checker-error' && /boom/.test(err.error));
ok('检查器抛错不会被误判成目标未通过', err.state !== 'target-failed');

const notRun = normalizeCheckResult({ ...base, ran: false });
ok('没跑且没理由 → not-run', notRun.state === 'not-run');
const skipped = normalizeCheckResult({ ...base, ran: false, reason: '需要宿主入口' });
ok('没跑但有理由 → skipped 且保留理由', skipped.state === 'skipped' && skipped.error === '需要宿主入口');
const to = normalizeCheckResult({ ...base, timedOut: true });
ok('超时 → timeout', to.state === 'timeout');

const bad = normalizeCheckResult({ ...base, findings: [{ severity: 'error', message: 'x' }] });
ok('目标有 error finding → target-failed', bad.state === 'target-failed' && bad.findings === 1);
const clean = normalizeCheckResult({ ...base, findings: [{ severity: 'info' }] });
ok('没有 error/warning → unchanged（不是“通过”这种含糊说法）', clean.state === 'unchanged');

const unknownPhase = normalizeCheckResult({ ...base, phase: 'nonsense' });
ok('未知阶段落到 discover，不静默接受', unknownPhase.phase === 'discover');

const s1 = summarizePhases([clean, clean]);
ok('全部 unchanged → pass', s1.verdict === 'pass' && s1.ok === true);
const s2 = summarizePhases([clean, skipped]);
ok('有 skipped → incomplete，不算 pass', s2.verdict === 'incomplete' && s2.ok === false);
const s3 = summarizePhases([clean, err]);
ok('有 checker-error → failing，不被当成目标问题', s3.verdict === 'failing' && s3.counts['checker-error'] === 1);
const s4 = summarizePhases([]);
ok('空结果 → pass 但 counts 全零（由调用方决定是否可信）', s4.verdict === 'pass' && Object.values(s4.counts).every((n) => n === 0));

console.log(fail ? 'CHECK_PHASE_FAILED ' + fail : 'CHECK_PHASE_OK');
process.exitCode = fail ? 1 : 0;
