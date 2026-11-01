# 方案 02-D：复检闭环 + 同步覆盖改成传递闭包（2026-11-02）

## 1. 同步白名单：改成传递闭包 ✅

`test-sync-coverage` 原来只看 `index.js` 的直接 import，所以 `console-data.js → health-issues.js` 这种
**间接依赖**漏检（本轮 mini 又因此起不来一次）。现在从 `index.js` 出发做 BFS，
任何被间接引用的 lib 文件都必须出现在同步白名单：

```
ok  index.js 依赖的 lib 文件都在同步白名单里   17（原来是 13）
```

## 2. 复检端点（宿主 + 独立控制台）✅

`POST /turnstile/issue-recheck`，body `{id, domain, subject}`：

1. **重新采集** health（不沿用旧健康项）
2. 重新归一化成 issue
3. `recheckIssue` 判定：

| 情况 | 结论 |
|---|---|
| 重新采到 pass | `resolved` |
| 仍然 fail / warn | `open` |
| 采不到证据，或该项消失 | `recheck-required` |

真机（mini）实测：

```json
{"ok":true,"resolution":"recheck-required",
 "issue":{"id":"env.auth","severity":"unknown",
 "summary":"登录记录数读不到（DSH 正在运行，库被锁）"}}
```

## 3. UI：每条 issue 一个「复检」按钮 ✅

展开详情后点击，结果显示三选一：`已恢复` / `仍未解决` / `取证不足，仍需人工确认`。
**apply 成功不等于已解决**这条纪律，在这里体现为「只有重新采集到 pass 才显示已恢复」。

## 验证

```
test-issue-recheck    4 条（端点行为 / 坏 JSON 400 / 不谎报 resolved）
e2e-console-offline   105/105（新增复检按钮与结论断言）
e2e-panel-offline      42/42
test:all               56 个套件 exit 0
```

## 仍未做

- 修复动作本身（`plugins.plugin-state` 的启用/停用）还没接进详情页按钮；现在只给「查看建议」
- `tools/doctor.mjs` 仍未输出同一份 issue
- 详情里没有独立的证据面板（内联文本）
