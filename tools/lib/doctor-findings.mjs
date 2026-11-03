'use strict';
// doctor 的四类发现（停用 / 路由重名 / UI 抢占 / 引擎跳过）是纯数据组装。
// 抽出来以后可以直接断言 issue id 与 severity，不必先跑一次完整的 profile 扫描。
export function doctorFindings({ skipped = [], dups = [], hot = [], userOff = [] } = {}) {
  const findings = [];
  for (const n of skipped) {
    findings.push({ checker: 'engines', severity: 'error', id: 'engine-skip', title: n + ' 会被引擎闸门跳过', evidence: ['engines.dsh 不满足当前运行时'] });
  }
  for (const d of dups) {
    findings.push({ checker: 'providers', severity: 'warn', id: 'route-dup-' + d[0], title: '模型 id ' + d[0] + ' 在 ' + (d[1] && d[1].size) + ' 个路由重复', evidence: ['dump-config 里的路由表'] });
  }
  for (const h of hot) {
    findings.push({ checker: 'ui-surface', severity: 'warn', id: 'ui-hot-' + h[0], title: h[0] + ' 被 ' + h[1] + ' 个插件注入', evidence: ['ui-scan 的注入计数'] });
  }
  for (const off of userOff) {
    findings.push({ checker: 'manage', severity: 'warn', id: 'disabled-' + off, title: off + ' 被手动停用', evidence: ['cordis.patch.yml disabled: true'] });
  }
  return findings;
}

export function doctorWarnCount({ skipped = [], dups = [], hot = [], userOff = [] } = {}) {
  return userOff.length + dups.length + hot.length + skipped.length;
}
