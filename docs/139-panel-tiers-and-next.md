# 面板两档 + `next[]` 契约 + 高危确认（2026-11-01）

## 1. 统一输出契约 `tools/lib/report.mjs`

按 03 设计 §2 落地：

```json
{ ok, verdict, summary, findings[], evidence[], next[], rollback?, exitCode, durationMs }
```

| 字段 | 规则 |
|---|---|
| `verdict` | exit→verdict：0 ok / 2 warn / 1 fail / 3、4 unknown（**unknown 是一等公民**） |
| `findings[].falsifier` | 没有就给默认「重跑后消失即误报」——不留空 |
| `next[].command` | 可原样执行的完整命令（agent 能跑、人能复制） |
| `rollback` | 只有写操作才有 |

**测试** `tools/test-report-contract.mjs` 13 条：映射、falsifier、证据规范化、next 结构、unknown 劝阻擅自修复、写操作 rollback/applyToken、只读无 rollback。

## 2. 面板：档位一 + 按钮条（已通真数据）

- **状态灯**：收起态的按钮上带 `data-testid="status-light"`，颜色映射 `verdict`（绿 ok / 黄 warn / 红 fail / 灰 unknown），60 秒轮询一次 `POST /turnstile/run {command:"doctor"}`。
- **按钮条**（run-strip）：体检 / 三查 / 诊断 / 槽位 / 快照；快照走 dry-run，成功后出现「确认执行」。

e2e（`e2e-panel-offline` 39/39）：

```
PASS  panel exposes the run strip
PASS  panel has run-doctor / run-surfaces / run-diagnose / run-slot-report / run-snapshot
PASS  collapsed card shows a status light
PASS  status light exposes its verdict   fail
```

> 离线 e2e 里那盏灯是 `fail`——因为 fixture profile 的 doctor 真的是 exit 1。**这是真数据，不是假灯。**

## 3. 高危命令的逐字确认（02 §4.4-3）

`manage-disable` 标记 `danger: true`，apply 时必须 `confirm` 与目标逐字一致：

```
dry                       200 true（签发 token）
apply 无 confirm          403 高危操作需要 confirm 与目标逐字一致（收到 ""…）
apply confirm 写错目标     403
apply confirm 正确         200 true
```

## 4. 真机验证（mini 18770）

```
POST /turnstile/run {"command":"doctor"}   → {"ok":true,"verdict":"ok","durationMs":680,…}
POST /turnstile/run {"command":"surfaces"} → {"ok":true,"verdict":"ok","durationMs":517,…}
POST /turnstile/run {"command":"nope"}     → 404
```

途中修的一个真 bug：`doctor` 在注册表里没声明位置参数 → live 上报 usage。加 `positional:['profile']` 后 normal。

## 5. 本轮没做

- **档位二抽屉**（360×420 的展开面板）没做：现在只有「收起 = 小按钮 + 灯」和「展开 = 完整面板」两态，中间那档缺；
- 控制台 IA 重排（首屏健康总览等 9 个视图顺序）没动；
- `next[]` 目前按 findings 严重度 + verdict 生成通用建议，**还没有把每条 finding 的 `agentPrompt` 填满**；
- better-sidebar 集成未动。
