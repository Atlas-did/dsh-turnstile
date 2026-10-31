// dsh.bundle.patch 可能是字符串，也可能是数组（多 patch 文件）。
//
// 2026-10-31：外部 agent 报告 tools/ui-surfaces.mjs 崩在 `patch.replace is not a function`。
// 复核属实，且 doctor.mjs / gate-map.mjs 有同一个假设。这里统一成一个函数。
import { join } from 'node:path';

export function patchFiles(pluginDir, patch) {
  if (!patch) return [];
  const list = Array.isArray(patch) ? patch : [patch];
  return list
    .filter((p) => typeof p === 'string')
    .map((p) => join(pluginDir, p.replace(/^\.\//, '')));
}
