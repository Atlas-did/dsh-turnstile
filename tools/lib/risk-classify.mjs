'use strict';
// 依赖风险判定（纯函数）：给三组 scope，给出红/黄/绿与理由。
// 抽到 lib 里才能被测试直接 import——risk.mjs 是 CLI 脚本，import 它会执行主流程。
export function classifyScopes({ imported, declared, peers }) {
  const imp = new Set(imported || []);
  const dec = new Set(declared || []);
  const peer = new Set(peers || []);
  const missing = [...imp].filter((s) => !dec.has(s));
  const peerOnly = [...imp].filter((s) => peer.has(s) && !dec.has(s));
  if (peerOnly.length) return { level: 'RED', missing, peerOnly, why: 'imports peer-only scope: ' + peerOnly.join(', ') };
  if (missing.length) return { level: 'AMBER', missing, peerOnly, why: 'imports undeclared scope: ' + missing.join(', ') };
  return { level: 'GREEN', missing, peerOnly, why: 'only official/public packages' };
}
