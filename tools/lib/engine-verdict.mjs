'use strict';
// 引擎闸门的结论与依据（纯函数）：能加载 / 凭豁免加载 / 被跳过，以及「凭什么」。
// basis 决定用户看到「已验证兼容」还是「没人拦」，不能靠字符串猜。
export function classifyEngine({ engine, issue, exempt = false }) {
  if (!engine) return { verdict: 'loads (no engines.dsh)', basis: 'undeclared', skipped: false };
  const compatible = issue === null || issue === undefined;
  if (compatible) return { verdict: 'loads', basis: 'declared-compatible', skipped: false };
  if (exempt) return { verdict: 'loads (exempted)', basis: 'exempted', skipped: false };
  return { verdict: 'SKIPPED', basis: 'declared-incompatible', skipped: true };
}

export function basisCounts(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, r) => {
    const k = r && r.basis ? r.basis : 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
