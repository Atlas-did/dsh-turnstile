# 2026-10-31 冻结语料 · 人工真值标签

冻结时间见 `manifest.json`（12 个文件，3,894,089 字节，逐个 sha256）。
**所有断言以本目录的冻结副本为准**，不引用线上日志——线上还在写（审核者一小时内看到 `unknown variant` 从 222 漂到 229）。

## 一、逐通道真值

| 通道 | 判定 | 冻结时的证据 | 什么能推翻它 |
|---|---|---|---|
| **codex runtime 同步** | ❌ 故障 | `unknown variant \`recency_at\`` = **236** 条；异常类 `openai_codex.errors.InvalidRequestError`；本机 `codex-cli 0.134.0` | 若出现 codex 的 `sync completed` 且无该错误 → 判错 |
| **dsh bridge 同步** | ❌ 故障（已有一段恢复期） | `dsh-bridge` 记录 6,057 条，其中 error 93 条；`ingest request failed` 112 条；`sync interrupted` 49 条 | 若同时段存在 `sync.ack` 且无 ingest 失败 → 判错 |
| **插件本地桥（socket 部分）** | ⚠️ 已停止的旧连接 | 插件日志 `PARSE_ERROR` 32 条、`ERR_STREAM_WRITE_AFTER_END` 6 条（对应旧版 2.0.2 进程） | 若新版 2.1.0 启动后仍出现 PARSE_ERROR → 标签要改 |
| **AA 后端可达性** | ✅ 可达 | 三路（直连/7897/31181）对 `web.agents-anywhere.com` 均 200 | —— |
| **AA 后端可用性** | ❓ 判不出 | 可达 ≠ 同步成功：同一条链上 401（认证失败 8 次）与 422（快照拒收 4 次）都记为失败；日志里 URL 与状态码在写入前就丢了 | 需要一次真实 `ingest` 的响应体留档 |

**关键教训：可达与可用必须分开两栏。** 今天三路 HTTP 200，而同一份日志里有 329 条 ERROR——
任何「HTTP 通即健康」的判定都会给出相反结论。

## 二、必备的四类用例（审核者点名，缺一不可）

| # | 用例 | 期望 | 现状 |
|---|---|---|---|
| A | 双故障（codex + dsh 同时坏） | 两条都要报，不能择一 | ✅ 本目录日志即双故障 |
| B | 探测方法错误（curl 没带 CA → 000） | 判「方法错误」，不判「环境故障」 | ⚠️ 命令留档见 §三，尚无工具断言 |
| C | 必须判「健康」的对照 | 输出健康 | ❌ **还没有**（第 1 轮 75% 假阳性就是因为没有对照） |
| D | 必须输出「判不出」的用例 | 输出判不出 + 缺什么证据 | ✅ 用「AA 后端可用性」这一栏 |

**没有 C 之前，任何「全绿」都无意义。** 这一条写在这里，避免下次又用自写夹具自我证明。

## 三、原始命令留档（防「把答案写进回放」）

```
# B 类：方法错误的探测（缺 CA → 假红）
curl -sS -o /dev/null -w '%{http_code}' --max-time 8 -x http://127.0.0.1:31181 https://github.com/
  -> 000   （假阳性：curl schannel 未带 CA/未关撤销检查）

# 同一目标，正确探测
curl -sS -o /dev/null -w '%{http_code}' --max-time 8 --ssl-no-revoke \
     --cacert ~/.dsh/certs/dev-sidecar-root.pem -x http://127.0.0.1:31181 https://github.com/
  -> 200

# C 类：pnpm 因 git 依赖失败（留档）
pnpm add @agents-anywhere/dsh-bridge-next@2.0.2
  -> [ERROR] Command failed with exit code 128: git ... fetch ... Failed to connect to github.com:443
  -> 修法：把依赖本地化（file:./vendor/math-research-dsh-2.0.4.tgz），之后 pnpm install --lockfile-only 2.1s 通过
```

## 四、这份语料怎么被使用（下一步）

`diagnose` 的第一条验收就是：**读本目录**（不是 `~/.agents-anywhere`），输出与上表逐行一致；
任何一条对不上，或者输出了「全部健康」，即视为未通过。
## 五、用例 C（健康对照）已就位

从冻结语料里切出 08:14–08:15 这一分钟：**1,014 条记录，0 条 ERROR**，全部 `dsh-bridge` debug/info。

```
tests/corpus/2026-10-31/logs/aa/healthy-window-0814.jsonl   1014 records   ERROR 0
```

它的用途：任何诊断结论拿这份当输入，**必须判健康**。判成故障 = 假阳性，直接算未通过。
这是第 1 轮「75% 假阳性」唯一能防住的东西，之前缺的就是它。

切片命令（可复跑，已留在本节）：

```bash
node tools/log-format.mjs tests/corpus/2026-10-31/logs/aa/healthy-window-0814.jsonl
# levels: debug=920 info=94    没有 error
```
## 六、勘误与目录调整（第 3 轮后）

| 原写法 | 实际 | 处理 |
|---|---|---|
| 「12 个文件 / 3,894,089 字节」 | 13 个 / 4,269,432 | 已按 manifest 更正（manifest 现为完整 64 位 sha256） |
| `healthy-window-0814.jsonl` 放在 `logs/aa/` | 它是 runtime 块的**逐字复制**（1014 条 seq 全重合），同扫会得到 10,239 条而非 9,225 | **已移到 `logs/control/`**，两目录永不同扫 |
| 「ingest request failed 112 条」 | 其中 **72 条 WARNING、40 条 ERROR**（我按 ERROR 筛只拿到 0，会漏掉整条通道） | severity 与 failure 分开统计 |
| 「按文件判故障」 | dsh 的 93 条 ERROR 散在 6 个文件（30/52/0/3/6/2），`runtime-…03996` 与 `…07986` 是 0 条 | 判定必须跨文件聚合，不能按单文件 |
| 时间戳 | dsh-bridge 用 `Z`，connector 用 `+08:00`，直接按字符串切窗差 8 小时 | S1 统一转 ISO-UTC |

冻结后的真实口径：

```
logs/aa        10 文件  9,225 条（seq 唯一）
logs/control    1 文件  1,014 条（0 ERROR，健康对照）
logs/plugin     2 文件     80 条（PARSE_ERROR 32 / ERR_STREAM_WRITE_AFTER_END 6）
```
