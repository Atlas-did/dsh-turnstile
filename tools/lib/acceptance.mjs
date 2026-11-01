// 验收判定的纯函数：让「一键验收是否通过」可以被行为测试，而不是靠源码字符串。

const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

/** 复判报告 → 是否算「真实宿主验收通过」。任何一层非 pass 都不算。 */
export function judgeVerify(report) {
  if (!report || typeof report !== 'object') return { ok: false, reason: '没有复判报告' };
  const levels = report.levels || [];
  const byId = new Map(levels.map((l) => [l.level, l]));
  const missing = LEVELS.filter((id) => !byId.has(id));
  if (missing.length) return { ok: false, reason: '缺少层级：' + missing.join(',') };
  const notPass = LEVELS.filter((id) => byId.get(id).status !== 'pass');
  if (notPass.length) {
    const first = byId.get(notPass[0]);
    return { ok: false, reason: notPass[0] + ' 未通过（' + first.status + '）：' + String((first.evidence || [])[0] || '').slice(0, 60) };
  }
  if (report.claim !== 'verified-with-regression') {
    return { ok: false, reason: '结论是 ' + (report.claim || 'unknown') + '，不是 verified-with-regression' };
  }
  if (report.ok !== true) return { ok: false, reason: '报告自身 ok=false' };
  return { ok: true, reason: 'L0–L5 全 pass 且 claim=verified-with-regression' };
}

/** 整体验收：所有步骤都 ok 才算通过，并指出第一个失败步骤。 */
export function judgeAcceptance(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const bad = list.filter((s) => !s.ok);
  if (bad.length) return { ok: false, reason: '步骤失败：' + bad.map((s) => s.id).join(',') };
  return { ok: true, reason: '全部 ' + list.length + ' 步通过' };
}
