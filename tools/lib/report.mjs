'use strict';
// 统一输出契约（03 设计 §2）：CLI 与 /turnstile/run 共用这一份整形逻辑。
//   { ok, verdict, summary, findings[], evidence[], next[], rollback?, exitCode, durationMs }
// summary 必须是人话；next[] 必须指得动且不自指；agentPrompt 由这里生产。

export const EXIT = { ok: 0, fail: 1, warn: 2, unknown: 3, usage: 4 };

export function verdictFromExit(code) {
  if (code === 0) return 'ok';
  if (code === 2) return 'warn';
  if (code === 3 || code === 4) return 'unknown';
  return 'fail';
}

const LABELS = {
  doctor: '整体体检', gate: '门禁检查', surfaces: 'UI 占用检查', 'slot-report': '槽位分布',
  'check-risk': '依赖风险检查', 'check-conflict': '冲突检查', 'check-engines': '版本闸门',
  inspect: '插件骨架读取', diagnose: '诊断', preinstall: '装前预检',
  'snapshot-take': '拍照快照', 'manage-enable': '启用插件', 'manage-disable': '停用插件',
};
const labelOf = (c) => LABELS[c] || ('「' + c + '」');

function normalizeFinding(f, i, profile) {
  const evidence = Array.isArray(f.evidence) ? f.evidence.map(String)
    : f.evidence ? [typeof f.evidence === 'string' ? f.evidence : JSON.stringify(f.evidence)] : [];
  const title = String(f.title || f.message || f.summary || '').slice(0, 200);
  const falsifier = String(f.falsifier || (f.fix && f.fix.snippet) || '若该现象在重跑后消失，则本条为误报');
  const agentPrompt = String(f.agentPrompt || f.suggestion || [
    '你在 DSH 的 turnstile 语境里，目标 profile：' + (profile || '<profile>') + '。',
    '问题：' + (title || f.id || '未知') + '。',
    evidence.length ? '证据：' + evidence.slice(0, 2).join('；') + '。' : '',
    '请先用只读命令确认，再给最小改动方案；写操作必须先 dry-run，等用户确认后才 --apply。',
    '如果 ' + falsifier + '，说明这条是误报，直接告诉用户忽略。',
  ].filter(Boolean).join(' '));
  return {
    id: String(f.id || f.checker || 'finding-' + (i + 1)),
    severity: String(f.severity || f.level || 'warn'),
    title, evidence: evidence.slice(0, 6), falsifier, agentPrompt,
  };
}

export function humanSummary(verdict, findings, command) {
  const n = findings.length;
  const errs = findings.filter((f) => ['error', 'high', 'fail'].includes(f.severity)).length;
  const who = labelOf(command);
  if (verdict === 'ok' && !n) return '通过：' + who + '没有发现问题。';
  if (verdict === 'ok' && n) return '基本可用：' + who + '发现 ' + n + ' 条需要看一眼（不阻塞）。';
  if (verdict === 'warn') return '需要看一眼：' + who + '有 ' + n + ' 条问题' + (errs ? '，其中 ' + errs + ' 条较严重' : '') + '。';
  if (verdict === 'fail') return '存在问题：' + who + '发现 ' + n + ' 条' + (errs ? '（含 ' + errs + ' 条严重）' : '') + '，需要处理。';
  return '数据不足：' + who + '没能给出结论（缺证据，不要据此修复）。';
}

const NEXT_BY_COMMAND = {
  doctor: [['gate', '跑完整门禁（逐项检查）']],
  gate: [['doctor', '回到整体体检'], ['fix', '把发现转成修复计划']],
  'check-risk': [['gate', '看完整门禁'], ['doctor', '回到整体体检']],
  'check-conflict': [['gate', '看完整门禁'], ['doctor', '回到整体体检']],
  'check-engines': [['gate', '看完整门禁'], ['doctor', '回到整体体检']],
  surfaces: [['slot-report', '看运行时每个插件插了哪些位置'], ['doctor', '回到整体体检']],
  'slot-report': [['surfaces', '看静态声明的占用'], ['doctor', '回到整体体检']],
  inspect: [['surfaces', '看这个面还被谁占用'], ['doctor', '回到整体体检']],
  diagnose: [['doctor', '回到整体体检']],
  preinstall: [['doctor', '装之前先体检'], ['inspect', '先看这个插件怎么插的']],
};

export function shapeReport({ command, exitCode, parsed, stderr, mutating, dryRun, applyToken, durationMs, profile }) {
  const findings = Array.isArray(parsed && parsed.findings) ? parsed.findings.map((f, i) => normalizeFinding(f, i, profile)) : [];
  const verdict = verdictFromExit(exitCode);
  const raw = parsed && typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const isStatusWord = ['warn', 'ok', 'fail', 'clear', 'blocked', 'unknown'].includes(raw.toLowerCase());
  const summary = (!isStatusWord && raw) ? raw : humanSummary(verdict, findings, command);
  const p = profile || '<profile>';
  const next = [];
  const add = (label, cmd, isMutating, reason) => next.push({ label, command: cmd, mutating: Boolean(isMutating), reason });
  for (const [cmd, label] of (NEXT_BY_COMMAND[command] || [])) {
    if (cmd === command) continue;
    add(label, 'node tools/turnstile.mjs ' + cmd + ' ' + p, false, '本步之外的下一步');
  }
  if (mutating && dryRun) add('确认执行（写入）', '# 前端点确认执行，或带 applyToken 重放', true, '写操作两段式：先计划，后确认');
  if (verdict === 'unknown') add('补齐证据再判断', 'node tools/turnstile.mjs doctor ' + p, false, 'undetermined：缺证据，不要擅自修复');
  if (!next.length && command !== 'doctor') add('回到整体体检', 'node tools/turnstile.mjs doctor ' + p, false, '本命令没有更具体的下一步');
  const report = {
    ok: exitCode === 0,
    verdict,
    command,
    summary: String(summary).slice(0, 300),
    findings,
    evidence: stderr ? [stderr.trim().split('\n')[0].slice(0, 200)] : [],
    next: next.slice(0, 3),
    exitCode,
    durationMs,
  };
  if (mutating) {
    report.rollback = { command: 'node tools/turnstile.mjs snapshot diff ' + p, note: '写操作会留 .bak；如需回退用快照' };
    if (dryRun && applyToken) report.applyToken = applyToken;
  }
  return report;
}
