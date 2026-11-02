'use strict';
// 检查阶段与失败可见性（上游研究第 2 批）。
// 目的：让「没跑」「跳过」「超时」「检查器自己坏了」「目标没通过」「没变化」六种情况各有名字，
// 而不是全部塌成一个 ok:false 或者一个空的 findings 数组。
export const CHECK_PHASE_SCHEMA = 'turnstile/check-phase@1';
export const PHASES = ['discover', 'manifest', 'static', 'conflict', 'runtime', 'post-change'];
export const STATES = ['not-run', 'skipped', 'timeout', 'checker-error', 'target-failed', 'unchanged'];

export function normalizeCheckResult(input = {}) {
  const phase = PHASES.includes(input.phase) ? input.phase : 'discover';
  const base = {
    schema: CHECK_PHASE_SCHEMA,
    checker: String(input.checker || 'unknown'),
    phase,
    subjectId: input.subjectId ? String(input.subjectId) : null,
    inputHash: input.inputHash ? String(input.inputHash) : null,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    error: null,
  };
  // 检查器自己抛出异常：那是检查器的问题，不是目标插件的问题
  if (input.threw) {
    return { ...base, state: 'checker-error', error: String(input.threw.message || input.threw).slice(0, 300) };
  }
  if (input.ran === false) {
    const reason = String(input.reason || '').trim();
    return { ...base, state: reason ? 'skipped' : 'not-run', error: reason || null };
  }
  if (input.timedOut) return { ...base, state: 'timeout', error: String(input.reason || '检查超时') };
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const failed = findings.filter((f) => f && (f.severity === 'error' || f.severity === 'warning'));
  if (failed.length) return { ...base, state: 'target-failed', findings: failed.length };
  return { ...base, state: 'unchanged', findings: 0 };
}

// 汇总：任何一个 state 都不能被压缩成"通过"
export function summarizePhases(results = []) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const r of results) if (r && counts[r.state] !== undefined) counts[r.state] += 1;
  const bad = ['checker-error', 'timeout', 'target-failed'].some((s) => counts[s] > 0);
  const unknown = ['not-run', 'skipped'].some((s) => counts[s] > 0);
  return {
    counts,
    ok: !bad && !unknown,
    verdict: bad ? 'failing' : unknown ? 'incomplete' : 'pass',
  };
}
