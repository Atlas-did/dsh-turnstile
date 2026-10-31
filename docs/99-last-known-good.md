# 「上次可用」比「当前」更需要被看见

DSH Desktop 的架构文档说：新 profile 只有在 Host/窗口/客户端都成功启动后才被记为**最近一次可用**，
失败会回退到上一次可用。但**界面不显示那个快照到底多久以前**。

## 我们加了什么

`GET /turnstile/profiles` 现在多返回一个字段：

```json
"lastKnownGood": { "name": "verified-bootable-20261002-1508", "at": "2026-10-02T07:50:23.370Z", "ageDays": 29 }
```

来源是 DSH 自己写的 `~/.dsh/profile-snapshots/verified-bootable-*`（我们没自己造快照，只读它的）。
环境管家页多一行：

```
上次可用快照 verified-bootable-20261002-1508（29 天前）
```

## 实测

```
真实 ~/.dsh  → { name: 'verified-bootable-20261002-1508', ageDays: 29 }   ✅
mini 的 home  → null（它确实没有这个目录，如实报 null 而不是借用别人的）
```

**为什么不跨 home 借用**：mini 的实验环境与主环境是两个 DSH home，用主环境的「上次可用」去安慰 mini 是错的。

## 为什么值得做

今天所有回滚都靠「记得先备份」。真正该看的是：**上一次能启动的状态有多旧**。29 天意味着——
如果现在把主 profile 搞坏，能退回的干净状态是一个月前的。这个数字应该在动手前就看见。

## 没做的

- 没有「一键回滚到这个快照」（涉及复制 patch/bundles，属于写操作，需要单独设计 + 用户确认）。
- 没有把 ageDays 做成健康检查项（超过 N 天告警）——目前只在面板显示。
