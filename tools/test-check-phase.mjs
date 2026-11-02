// 检查阶段契约：六种状态各有名字，检查器自身失败不能冒充目标未通过。
import { normalizeCheckResult, summarizePhases, stateFromLayer, stateFromCheck, phaseForLevel, PHASES, STATES } from './lib/check-phase.mjs';
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

// 旧四态 → 六态：不重新解释语义
ok('pass 不升级成“通过”，只记 unchanged', stateFromLayer('pass') === 'unchanged');
ok('skip/unknown 分开：明确跳过 vs 没跑出结论', stateFromLayer('skip') === 'skipped' && stateFromLayer('unknown') === 'not-run');
ok('fail → target-failed', stateFromLayer('fail') === 'target-failed');

// 每个验证层级都要有阶段，未知层不冒充具体阶段
ok('六个验证层都有阶段', ['L0','L1','L2','L3','L4','L5'].every((l) => PHASES.includes(phaseForLevel(l))));
ok('L5 是写后回归，不是运行态', phaseForLevel('L5') === 'post-change');
ok('未知层级落到 discover', phaseForLevel('L9') === 'discover' && phaseForLevel(undefined) === 'discover');

// 从 check 对象读六态：没有 ok 就不是通过
ok('check 没有 ok → not-run（不是通过）', stateFromCheck({ name: 'x' }) === 'not-run');
ok('check.ran=false + reason → skipped', stateFromCheck({ ran: false, reason: '需要宿主' }) === 'skipped');
ok('check 抛错 → checker-error', stateFromCheck({ threw: 'boom' }) === 'checker-error');
ok('check 有 error finding → target-failed', stateFromCheck({ ok: true, findings: [{ severity: 'error' }] }) === 'target-failed');
ok('check.ok=false → target-failed；ok=true → unchanged', stateFromCheck({ ok: false }) === 'target-failed' && stateFromCheck({ ok: true }) === 'unchanged');
// 真实检查器用 warn / high / fail 这三种写法；只认 error/warning 会把它们漏成 unchanged
ok('warn 也算失败（doctor 的写法）', stateFromCheck({ ok: true, findings: [{ severity: 'warn' }] }) === 'target-failed');
ok('high / fail 也算失败', stateFromCheck({ ok: true, findings: [{ severity: 'high' }] }) === 'target-failed' && stateFromCheck({ ok: true, findings: [{ severity: 'fail' }] }) === 'target-failed');
ok('info 不算失败', stateFromCheck({ ok: true, findings: [{ severity: 'info' }] }) === 'unchanged');

console.log(fail ? 'CHECK_PHASE_FAILED ' + fail : 'CHECK_PHASE_OK');
process.exitCode = fail ? 1 : 0;
