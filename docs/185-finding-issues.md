# doctor findings 也归一化成 issue（2026-11-02）

上一轮只把健康项变成 issue，doctor 自己的四类发现（停用 / 路由重名 / UI 抢占 / 引擎跳过）还是另一种形状。
这轮把它们也归一化，ID 以 `doctor.` 开头，和健康 issue 区分得清。

## 映射规则

| checker | domain | 严重度 |
|---|---|---|
| engines | plugins | error |
| providers | providers | warning |
| ui-surface | ui | warning |
| manage | plugins | warning |

证据来源写成 `doctor:<checker>`，修复能力一律 `supported:false`（这些都不是一键能修的东西，
所以详情里不会出现「准备修复计划」的假按钮）。

## 实测（desktop profile）

```
total: 13   （3 条健康 + 10 条 findings）
health:  env.bridge, plugins.bundles, env.auth
findings: doctor.ui-hot-ui-settings, doctor.ui-hot-ui-conversation, …
groups: { needsAction: 2, needsReview: 10, unknown: 1 }
```

## 测试

```
test-findings-issues   8 条（形状 / 稳定 ID / 严重度 / domain / 证据来源 / 分组 / 无伪修复按钮 / 坏输入）
test-issue-parity      5 条（健康子集与 UI 完全一致；findings 全部 doctor.* 前缀）
test:all              58 个套件 exit 0
```

## 边界说明

控制台 UI 目前只展示健康 issue —— findings 需要跑 doctor 才有，控制台没有重复实现这些检查。
这是有意的：宁可少显示，也不在 UI 里假装跑过一遍 doctor。

## 仍未做

- UI 里没有「把 findings 合并进三组」的入口（要么真跑 doctor，要么保持现状）
- `01-console-shell` 的统一任务入口还没动
