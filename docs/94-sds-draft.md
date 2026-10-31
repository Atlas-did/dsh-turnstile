# SDS 草稿 v0：DSH 环境诊断（diagnose）

> 状态：**草稿，未经用户确认**。依据 docs/92（第 1 轮审核）、docs/93（v2 计划）、
> tests/corpus/2026-10-31/labels.md（真值标签）。

## 1. 范围

一个入口：`node tools/diagnose.mjs [--corpus <dir>] [--json]`。
不新增第二个 CLI；子能力是模块（`tools/lib/*.mjs`），由入口调用。

**不做**：改代理、装/卸插件、改第三方代码、自动修复（只给修法与回滚点）。

## 2. 结论模型（这决定一切）

```
{
  channels: [ { id, verdict: 'healthy' | 'failing' | 'undetermined',
                reachable: 'yes' | 'no' | 'unknown',   // 网络层
                usable:    'yes' | 'no' | 'unknown',   // 业务层（同步是否成功）
                evidence: [ { file, sha256?, line?, text } ],
                falsifier: '<什么结果能推翻这条结论>' } ],
  actions: [ { text: '<一条可复制命令>', rollback: '<回滚点>' } ]
}
```

**硬规则**：

1. `reachable` 与 `usable` 分开两栏，永不合成为一个布尔（今天三路 200 却有 329 条 ERROR）。
2. `verdict` 允许 `undetermined`，但必须给 `missing`（缺哪条证据）。
3. 每条结论必须有 `falsifier`，否则不得输出。
4. 证据必须带 `file` + `sha256`（与 corpus manifest 对齐），禁止引用线上仍在写的文件。

## 3. 协议一页纸（AA ↔ DSH 插件）

| 环节 | 谁发 | 发什么 | 缺了会怎样 | 证据等级 |
|---|---|---|---|---|
| 插件启动 | DSH 插件 | `~/.dsh/agents-anywhere/bridge/endpoint.json` `{version:1,host,port,token,pid}` | AA 找不到本地桥 | 实测（文件存在、端口 LISTENING） |
| 本地握手 | AA → 插件 | JSON-RPC 2.0 行协议，`params.protocolVersion` 需匹配 `^1\.\d+$` 且 `runtime==='dsh'` | 校验失败 → 插件回 `PARSE_ERROR` 并断开 | 实测（插件源码 + 32 条 PARSE_ERROR） |
| 云端同步 | AA connector → `web.agents-anywhere.com` ingest | 快照批次 | 日志 `backend ingest request failed: `（详情为空） | 实测（112 条） |
| codex 同步 | AA → codex-cli | JSON-RPC，字段 `created_at/updated_at` | 字段 `recency_at` 被拒 → `-32600 unknown variant` | 实测（236 条 + codex-cli 0.134.0） |
| **未知** | — | ingest 的确切 URL/状态码；AA 如何发现插件（connector.json vs endpoint.json） | — | **未查明**（日志写前丢失，安装包里搜不到） |

这一页的作用：以后任何人（包括我）改这块，先对照本表；表里标「未查明」的，**不许猜**，只能加探测。

## 4. 验收裁判（唯一）

输入固定为 `tests/corpus/2026-10-31/`（13 文件 / 4,269,432 字节 / sha256 在 manifest）。四个用例：

| 用例 | 输入 | 必须输出 |
|---|---|---|
| A 双故障 | `logs/aa` 全量 | codex = failing；dsh = failing（曾有 93 条 sync_failed）；两者不得互相掩盖 |
| B 方法错误 | 命令留档（缺 CA 的 curl） | verdict = undetermined + 「探测方法错误」，不得判环境故障 |
| C 健康对照 | `healthy-window-0814.jsonl`（1014 条 0 ERROR） | **全部 healthy**，任何红都算假阳性 |
| D 判不出 | AA 后端可用性 | undetermined + `missing: 'ingest 响应体未留档'` |

**四个用例全过 ≠ 完成**，还要求：换一份新日志（非本 corpus）时，若证据不足必须输出 undetermined 而不是猜。

## 5. mini 的定位（规则，不是借口）

| 类别 | mini 能否验 | 说明 |
|---|---|---|
| profile 内写入 / 插件装配 / UI 注入 / 控制台 | ✅ | 已有 68+44+29 条 e2e |
| 全局路径（`~/.agents-anywhere`、`%APPDATA%`） | ❌ 缺条件 | 需要真实桌面进程与全局目录 |
| 外部进程（AA/Codex）与真实网络 | ❌ 缺条件 | 需要真实客户端 |

规则：**凡属「❌ 缺条件」，诊断只在主 profile 只读进行，并在结论里写明缺什么条件**；不得省略该通道，
也不得用 mini 的绿灯代替。

## 6. 分阶段与 DoD

| 阶段 | 交付 | DoD（对 corpus，不对自写夹具） |
|---|---|---|
| S1 | `tools/lib/logs.mjs`：格式统计 + 记录抽取（已有一个 `log-format.mjs` 可复用） | 对 corpus 13 文件读出 9,225 / 1,014 两个已知计数 |
| S2 | `tools/lib/channels.mjs`：按 name/exception 映射到通道（codex / dsh / ingest） | A 用例两通道都判 failing，且不把 C 误判 |
| S3 | `tools/diagnose.mjs` 入口 + JSON 契约 | A/B/C/D 四用例输出与本文件 §4 逐行一致 |
| S4 | 面板只读展示（复用 `/turnstile/health`） | 面板显示与 CLI 同一份 JSON（同 sha256 证据） |

## 7. 风险

| 风险 | 应对 |
|---|---|
| 又变成「猜」 | 每条结论必须带 falsifier + 证据文件 + sha256 |
| 归类规则写死答案 | S2 的规则表由真值标签反推，新增日志类型时必须先跑 S1 统计 |
| 面板复述 | 面板只渲染 CLI 的 JSON，不再单独算一遍 |
