'use strict';
// 统一输出契约（03 设计 §2）：CLI 与 /turnstile/run 共用这一份整形逻辑。
//
//   { ok, verdict, summary, findings[], evidence[], next[], rollback?, exitCode, durationMs }
//
// next[] 是灵魂：每条命令都要告诉 agent/人「下一步该干什么」，且 command 可原样执行。
// verdict=unknown 是一等公民：数据不足就明说，不猜。

export const EXIT = { ok: 0, fail: 1, warn: 2, unknown: 3, usage: 4 };

export function verdictFromExit(code) {
  if (code === 0) return 'ok';
  if (code === 2) return 'warn';
  if (code === 3) return 'unknown';
  if (code === 4) return 'unknown';
  return 'fail';
}

function normalizeFinding(f, i) {
  const evidence = Array.isArray(f.evidence) ? f.evidence.map(String)
    : f.evidence ? [typeof f.evidence === 'string' ? f.evidence : JSON.stringify(f.evidence)] : [];
  return {
    id: String(f.id || f.checker || 'finding-' + (i + 1)),
    severity: String(f.severity || f.level || 'warn'),
    title: String(f.title || f.message || f.summary || '').slice(0, 200),
    evidence: evidence.slice(0, 6),
    falsifier: String(f.falsifier || (f.fix && f.fix.snippet) || '若该现象在重跑后消失，则本条为误报'),
    agentPrompt: String(f.agentPrompt || f.suggestion || ''),
  };
}

function normalizeNext(n) {
  if (typeof n === 'string') return { label: n, command: n, mutating: false, reason: '来自命令的下一步建议' };
  return {
    label: String(n.label || n.command || '下一步'),
    command: String(n.command || ''),
    mutating: Boolean(n.mutating),
    reason: String(n.reason || ''),
  };
}

/**
 * 把一次命令执行结果整形为契约。
 *   command    命令名（用于生成 next 的命令行）
 *   raw        原始 {exitCode, stdout, parsed, stderr}
 *   extra      { dryRun, applyToken, mutating }
 */
export function shapeReport({ command, exitCode, parsed, stderr, mutating, dryRun, applyToken, durationMs }) {
  const findings = Array.isArray(parsed && parsed.findings) ? parsed.findings.map(normalizeFinding) : [];
  const verdict = verdictFromExit(exitCode);
  const summary = (parsed && (parsed.result || parsed.summary || parsed.verdict))
    || (exitCode === 0 ? '完成' : (stderr || '').trim().split('\n')[0].slice(0, 160) || '失败（无输出）');

  const next = Array.isArray(parsed && parsed.next) ? parsed.next.map(normalizeNext) : [];
  for (const f of findings) {
    if (f.severity === 'error' || f.severity === 'high' || f.severity === 'fail') {
      next.push({ label: '修复：' + (f.title || f.id).slice(0, 40), command: 'node tools/turnstile.mjs ask <profile> "修一下"', mutating: true, reason: f.falsifier });
    }
  }
  if (!next.length) {
    if (mutating && dryRun) next.push({ label: '确认执行（写入）', command: '# 前端点确认执行，或带 applyToken 重放', mutating: true, reason: '写操作两段式：先计划，后确认' });
    if (verdict === 'unknown') next.push({ label: '补齐证据再判断', command: 'node tools/turnstile.mjs doctor <profile>', mutating: false, reason: 'undetermined：缺证据，不要擅自修复' });
    if (verdict === 'fail') next.push({ label: '看完整诊断', command: 'node tools/turnstile.mjs diagnose --live', mutating: false, reason: '失败原因在 stderr，先看诊断再动手' });
    if (verdict === 'ok') next.push({ label: '看整体状态', command: 'node tools/turnstile.mjs doctor <profile>', mutating: false, reason: '本步通过，继续看全局' });
  }
  const sourceEvidence = Array.isArray(parsed && parsed.evidence) ? parsed.evidence : [];
  const evidence = sourceEvidence.map((e) => typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 6);

  const report = {
    ok: exitCode === 0,
    verdict,
    command,
    summary: String(summary).slice(0, 300),
    data: parsed ?? null,
    findings,
    evidence: evidence.length ? evidence : (stderr ? [stderr.trim().split('\n')[0].slice(0, 200)] : []),
    next: next.slice(0, 5),
    exitCode,
    durationMs,
  };
  // 写操作：给出回滚点与一次性 token（与 02 §4.4 共用一套）
  if (mutating) {
    report.rollback = { command: 'node tools/turnstile.mjs snapshot diff <profile>', note: '写操作会留 .bak；如需回退用快照' };
    if (dryRun && applyToken) report.applyToken = applyToken;
  }
  return report;
}
