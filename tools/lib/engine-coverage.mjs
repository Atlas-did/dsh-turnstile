'use strict';
// 引擎闸门的覆盖范围（纯函数）：只有 bundles 被评估；没有运行时版本时一个都没评估。
// 纯函数，便于直接测两个分支（有/没有运行时版本）
export function coverageOf({ rows, runtime }) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    plugins: list.length,
    evaluated: list.filter((r) => r.verdict !== 'NOT INSTALLED').length,
    notInstalled: list.filter((r) => r.verdict === 'NOT INSTALLED').length,
    runtimeKnown: Boolean(runtime),
    note: !runtime
      ? '运行时版本未知：没有任何插件被 engines.dsh 评估过（不是通不过）'
      : list.some((r) => r.verdict === 'loads (no engines.dsh)')
        ? '有插件没有声明 engines.dsh：能加载但未经声明验证'
        : '全部插件都按声明评估过',
  };
}

