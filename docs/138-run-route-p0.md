# `/turnstile/run`（02 设计 §4 的 P0）+ 三个收尾（2026-11-01）

## 1. 统一入口：一条路由替掉「一个按钮一条路由」

```
POST /turnstile/run
{ "command": "inspect", "args": {"pkg": "plug-alpha"} }
{ "command": "snapshot-take", "args": {}, "dryRun": true }        → applyToken
{ "command": "snapshot-take", "args": {}, "applyToken": "…" }    → 真写
```

出参契约：`{ ok, verdict, command, exitCode, durationMs, summary, data, findings, evidence, next, applyToken? }`。

### 两条实现位置共用同一份代码

| 位置 | 挂载 |
|---|---|
| 插件 `lib/index.js` | `POST /turnstile/run` → `lib/run-route.js` |
| `tools/console-server.mjs` | 同一条路由、同一个 `handleRun` |

面板与控制台因此**永远不会出现两套数据**——这正是当初假数据的成因。

### 命令注册表 `tools/lib/commands.mjs`

12 个命令，每个声明 `{script, mutating, json, timeout, positional, fixed, flagMap, flags}`：
doctor / gate / surfaces / slot-report / snapshot-list / snapshot-diff / inspect / diagnose / preinstall /
snapshot-take / manage-enable / manage-disable。

**白名单即注册表**：注册表里没有的命令一律 404。

## 2. 安全约束（服务端强制，不靠前端自觉）

| 规则 | 实测 |
|---|---|
| 写操作没有 dryRun → 403 | `写操作必须先 dry-run：缺少或无效的 applyToken` |
| dryRun 签发一次性 token（5 分钟） | `200 true` |
| token 一次性 | 复用 → `403` |
| token 绑定 command+args 哈希 | 换参数 → `applyToken 与本次参数不匹配（参数被改过？）` |
| 同命令 2 秒内去重 | 连点 → `429` |

## 3. 测试

`plugins/turnstile-popup/test/run-route.test.mjs` **10 条**，全过：
只读直跑、契约字段齐全、未知命令 404、写操作需 dry-run、token 签发/执行/不可复用/绑定参数、限流。

## 4. 同批三个收尾

| 项 | 结果 |
|---|---|
| gate-map 里的 `if (false)` 旧扫描循环 | 删了 697 字符；`ui surfaces 14` 与迁移前一致 |
| `slot-scan.mjs` 迁移 | 改走 `lib/ui-scan`，输出与迁移前**逐行相同**（HARDCODED 列表一致） |
| `console-server --fixture` | 新增 CLI 开关；实测打印 `Data: FIXTURE（假数据，仅供演示）` / `Data: real（真跑工具）` |
| promote 并存 | 写清分工：`promote.mjs` 拷文件 / `sandbox-promote.mjs` 改配置；promote 运行时打提示；`test-promote-split.mjs` 4 条锁住 |

## 5. 未做

- **面板三档 UI**（迷你卡状态灯 / 抽屉 / 控制台 IA 重排）——`/turnstile/run` 是它的地基，UI 还没接；
- 高危命令的 `confirm: "<目标名>"` 二次确认字段（设计 §4.4-3）**未实现**；
- `next[]` 目前只有失败时的两条兜底建议，还没有按 finding 生成可点动作；
- better-sidebar 集成（设计 §6 的 P2 探针）没动。
