'use strict';
// 冲突裁决（纯函数）：把「哪些是真实冲突、哪些只是 stale 线索、退出码是多少」从 CLI 里分出来。
// stale 线索没有当前证据，只能提示，不能阻断——这条规则以前埋在 process.exit 前面。
export const BLOCKING_KINDS = new Set(['ctx-assign', 'service-dup', 'fixed-port', 'state-file']);
export const HINT_KINDS = new Set(['ctx-assign-stale', 'dep-divergence']);

export function verdictOfRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const blocking = list.filter((r) => BLOCKING_KINDS.has(r.kind));
  const hints = list.filter((r) => HINT_KINDS.has(r.kind));
  // 未知 kind 也按阻断处理：不认识的东西不能悄悄当提示放过
  const unknown = list.filter((r) => !BLOCKING_KINDS.has(r.kind) && !HINT_KINDS.has(r.kind));
  return {
    blocking: blocking.length + unknown.length,
    hints: hints.length,
    code: blocking.length + unknown.length ? 6 : 0,
    verdict: blocking.length + unknown.length ? 'fail' : 'ok',
  };
}

export function severityOf(kind) {
  return HINT_KINDS.has(kind) ? 'warning' : 'error';
}
