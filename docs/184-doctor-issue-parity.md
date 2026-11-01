# CLI 与 UI 同源：doctor 输出同一份 issue（2026-11-02）

方案 02 验收第一条：「同一真实检查在 CLI、管家和详情页产生同一 issue ID 与状态」。

## 改动

`tools/doctor.mjs --json` 现在带 `issues` + `issueGroups`，与 `console-data` 用同一套：

- 采集：`collectHealth({ profileDir, hostBases: [DSH_BIN] })`
- 归一化：`issuesFromHealth` → 稳定 ID / 严重度 / 证据 / 修复能力
- 详情：`issueDetail` 四段式随每个 issue 一起返回

## 一致性测试 `test-issue-parity`

对同一 profile 分别取 doctor 与 console-data 的 issue，断言：

```
ok   doctor 与 console-data 的 issue ID 完全一致   env.auth vs env.auth
ok   严重度也一致
```

真机（desktop profile）：doctor 输出 3 条 —— `env.bridge=error`、`plugins.bundles=error`、`env.auth=unknown`。

## 验证

```
test-issue-parity   4 条
test:all           57 个套件 exit 0
```

## 仍未做

- doctor 原有的 findings（停用/路由重名/UI 抢占/引擎跳过）还没映射成同类 issue —— 它们目前是另一种形状
- 宿主 UI 的复检按钮只在独立控制台 e2e 覆盖，宿主侧只做了端点冒烟
