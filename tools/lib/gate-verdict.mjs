'use strict';
// 门禁阻断裁决（纯函数）：哪些失败真的阻断、哪些只是 advisory（例如「引擎会跳过」不代表 profile 坏了）。
// 这条规则以前只能靠集成测试覆盖，抽出来后可以直接断言每条分支。
export function blockingOf({ results, selected }) {
  const advice = new Map((Array.isArray(selected) ? selected : []).map((c) => [c.name, Boolean(c.advisory)]));
  const list = Array.isArray(results) ? results : [];
  const blocking = list.filter((r) => !r.ok && !advice.get(r.name));
  const advisory = list.filter((r) => !r.ok && advice.get(r.name));
  return {
    blocking,
    advisoryFailures: advisory,
    blocked: blocking.length > 0,
    code: blocking.length ? 1 : 0,
  };
}
