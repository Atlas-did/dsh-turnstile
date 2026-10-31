# AA 连不上：两个故障叠在一起（协议版本 → 出站代理）

一句话：`2.0.2 插件 × 2.1.0 桌面端` 的 `PARSE_ERROR` 只是第一层；升级后仍然「启动中」，第二层是 AA 的 Python connector 把同步批次发给云端时走了本地代理，`aa.dsh.v2.Sync.ingestBatch` 一直失败。两层都通了，DSH 才真正变成「运行中」。

## 先说适用条件（否则这不是你的故障）

这两个故障是**并列**的，不是因果链：任何一个单独成立都能让 AA 连不上；两个都不成立时，AA 大概率是正常的。先跑下面 2 项，再决定要不要往下读。

| 检查 | 命中本故障的条件 | 怎么查 |
|---|---|---|
| 协议线 | 桌面端 2.1.0（meshcall v2）+ 插件 2.0.2（v1） | AA `ProductVersion`；插件 `lib/index.js` 的 `protocolVersion` / `PROTOCOL_VERSION_MISMATCH` |
| 出站代理 | `ALL_PROXY` / `HTTPS_PROXY` 指向一个坏代理（如 7897） | `HKCU\Environment`、`netsh winhttp show proxy`、端口监听；直连 vs `curl -x` 对比 |

判定表：

| 桌面端 | 插件 | 代理 | 结论 |
|---|---|---|---|
| 2.1.0 | 2.0.2 | 任意 | 故障一：先升插件到 2.1.0 |
| 2.1.0 | 2.1.0 | 坏 | 故障二：NO_PROXY / 修代理 |
| 2.0.x | 2.0.2 | 无 | **不适用**：双方都是 v1，正常握手 |
| 2.0.x | 2.0.2 | 坏 | 只有故障二 |

反例（2026-10-31，另一台机器 `C:\Users\星`）：AA `2.0.3.0`、插件 2.0.2、无任何 `*_PROXY`、无 7897 监听；`PARSE_ERROR = 0`、`backend ingest request failed = 0`、`sync.ack` 10319 次、`throughSeq` 最高 2671，AA 显示「运行中」。它那 10 次告警是 `resubscribing for history calibration`，属于流断开后的重新订阅，和本文两条不是同一件事。→ 本文**不适用于它**，也不需要改任何配置。

## 症状

> 以下证据都来自本机 `C:\Users\finef`（AA 2.1.0 + `ALL_PROXY=http://127.0.0.1:7897`），不是通用现象。

- AA 设备页：DSH「启动中 · DSH 会话同步中断，正在重试」
- 插件日志：`bridge.connected` → `PARSE_ERROR` ×5 → `ERR_STREAM_WRITE_AFTER_END` → `disconnected initialized=false`
- `127.0.0.1:59040 LISTENING`（pid = DSH），AA 侧有 `TIME_WAIT`
  → 连接确实到达了插件，不是「没启动 / 文件不存在」

## 故障一：协议版本不匹配（已修）

| 组件 | 版本 |
|---|---|
| AA 桌面端 | 2.1.0（meshcall v2） |
| DSH 插件 | 2.0.2（v1 行协议） |
| npm 上 | 2.0.0 / 2.0.1 / 2.0.2 / 2.1.0 |

`PARSE_ERROR` = 插件按 JSON-RPC 2.0 行协议解析不了 AA 发来的字节。

一个容易误判的细节：升级后日志里那 5 条 `PARSE_ERROR` 的堆栈行号（`lib/index.js:6563/6697`）**和磁盘上 2.1.0 的同名文件对不上**。原因是旧进程 pid 67648 内存里仍是 2.0.2，文件已被覆盖；该进程 15:42:55 `bridge.stopped`，新进程 21308 于 15:57:42 启动后才真正加载 2.1.0。

**修法**：`@agents-anywhere/dsh-bridge-next` 2.0.2 → 2.1.0，补 `meshcall@0.3.0` 与 `ajv@8.20.0 / ajv-formats@3.0.1`，完全退出 DSH 再开。

**结果**：重启后不再有 `PARSE_ERROR`，AA 日志里出现 `aa.dsh.v2.Bridge.sync`，说明 meshcall v2 握手成功。

## 故障二：出站 ingest 被本地代理掐断（真正最后一层）

握手成功后状态仍是「启动中」，日志变成：

```
aa.dsh.v2.Sync.ingestBatch
  -> ConnectorNetworkError('backend ingest request failed: ')   ~5s
  -> DSH event sync interrupted; resubscribing in 30s
```

代码链路（AA 安装目录 `resources/connector/connector/`）：

- `server/ingest.py:254`：任意 `httpx.RequestError` 都被包成这条**空消息**
- `server/client.py:526`：`trust_env=not is_loopback_url(server_url)`，云端地址不是 loopback → 读环境变量代理
- `runtimes/dsh/runtime.py:551`：同步 relay 失败就把健康状态打回 `starting`，文案正是「DSH 会话同步中断，正在重试」

实测（同一台机器）：

| 路线 | 结果 |
|---|---|
| 直连 `POST /api/v2/connector/ingest` | HTTP 422（可达） |
| 经 `http://127.0.0.1:7897` | SSL EOF / 超时；CONNECT 返回 200 但隧道随后断 |
| `ALL_PROXY` | `http://127.0.0.1:7897`（`verge-mihomo`） |

所以不是 AA 配置错，也不是插件错。根因是 **Clash 处于 global 模式**（`clash-verge.yaml:3`）：经 7897 的所有请求都被塞进同一个海外节点，节点一抖，直连明明可达的域名也会超时。浏览器之所以没事，是系统代理被 `dev-sidecar`（31181）占着，而它的 `ProxyOverride` 里有 `*.deepseek.com`。

## 修法（已执行并验证）

1. `HKCU\Environment\NO_PROXY` 末尾追加 `agents-anywhere.com`（旧值一个没删）
2. 广播 `WM_SETTINGCHANGE`，让 Explorer 更新环境块
3. **完全退出**并重启 Agents Anywhere（环境变量只在进程启动时读取）
4. 验证：

| 证据 | 结果 |
|---|---|
| 最后一次 `backend ingest request failed` | 16:14:07，之后无新增 |
| DSH `sync.ack` | 正常出现（batchSeq 递增） |
| `rti_deMr4bri_2p0kMhl/sync-state.json` | 16:17:34 仍在前进 |
| AA 界面 | Claude / Codex / DSH 均为「运行中」 |

补充：重启后端口会变（59040 → 60971），锁文件和 `connector.json` 会更新，这不是故障。重启开头 40 秒内还有 2 次尾部失败（16:13:48 / 16:14:07），之后稳定；未再复现，按在途请求处理。

## 故障三（误报）：DeepSeek 官方 API 也报 transport failed

修完 AA 约 18 分钟后，DSH 报「DeepSeek Messages transport failed」。核对后与 NO_PROXY 改动无关：

- 会话记录：`provider=deepseek-account`，失败时间 16:30:07，`code=TRANSPORT`（网络层，不是 401/鉴权）
- DSH 在**启动时**固化代理策略：`dsh-http-proxy` 读 `ALL_PROXY/HTTPS_PROXY` 后 `setGlobalDispatcher`；`dsh-llm-deepseek/lib/index.js:2188` 用的是 `globalThis.fetch`
- DSH 进程 15:57:42 启动，早于 16:12 的 NO_PROXY 改动 → 它根本没拿到新值
- 同一个 Clash：global 模式 + 单节点抖动。16:12 经 7897 测 google / api.deepseek.com 超时；直连 5/5 返回 401（可达）

处理（2026-10-31 23:3x）：

1. Clash 已从「全局」切回「规则」——DSH 不用重启就能恢复
2. 用户级 `NO_PROXY` 已追加 `deepseek.com,opencode.ai`（旧值保留）；DSH 要**完全退出再启动**才会读到
3. 别同时让 Clash 和 `dev-sidecar` 管系统代理，否则三层路由会继续互相覆盖

## 下次照这个顺序判定

0. 先过上面的适用条件表（版本线 + 代理），不命中就别套本文
1. 两端版本矩阵：桌面端 / 插件 / npm latest
2. 端口是否 `LISTENING`，AA 侧是否有 `TIME_WAIT`
3. 插件日志有没有 `PARSE_ERROR` → 协议层
4. 握手 OK 但状态 `starting` → 测出站：
   `curl -x http://127.0.0.1:7897 https://web.agents-anywhere.com/...` 与直连对比
5. 分清「用户变量已写」与「当前进程已读到」（见 docs/102）
6. 只有 UI「运行中」+ `sync.ack` + `sync-state` 前进，才算修好

## 回滚

- 删掉 `NO_PROXY` 末尾的 `,agents-anywhere.com`，重启 AA
- 插件可装回 2.0.2，但 2.1.0 桌面端会再次 `PARSE_ERROR`，不建议

## 附注：`desktop.executablePath` 的 GBK 乱码（仅另一台机器）

`C:\Users\星` 那台的 `connector-runtime.json` 里 `desktop.executablePath` 是 `C:\Users\鏄焅\...`（「星」被 GBK 化，即 `星` 的 UTF-8 字节按 GBK 读回去）。它不影响同步，只在 AA 按记录路径重启自身时可能踩空。

修复（在**那台机器**上做，先完全退出 AA）：备份 `connector-runtime.json`，把 `desktop.executablePath` 改成真实路径，或删掉该字段让 AA 下次启动重写。本机（finef）该字段是正常的 `D:\Software_download_link\Agents Anywhere\Agents Anywhere.exe`。

## 证据与相关文档

- `~/.agents-anywhere/logs/runtime-*.jsonl`
- `~/.agents-anywhere/conn_*/rti_deMr4bri_2p0kMhl/sync-state.json`
- AA 安装目录 `resources/connector/connector/server/{ingest.py,client.py}`、`runtimes/dsh/runtime.py`
- docs/88：第一层（协议版本）
- docs/89：2026-10-31 全天复盘（含「诊断停在第一层」的自省）
- docs/102：NO_PROXY「持久化 ≠ 生效」

一句话收尾：**版本对齐解决「能不能通话」，代理绕过解决「能不能送达」；两段都验证过，才算修好。**
