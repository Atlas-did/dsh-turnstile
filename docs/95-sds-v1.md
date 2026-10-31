# SDS v1（吸收 SDS 审核，仍待用户确认作用域决策）

> 相对 v0 的四处实质修改，全部来自审核：①通道需要 `history` ②语料必须分目录且去重
> ③S1/S2 接口写死（导出 `readRecords` + 纯函数 `classify/aggregate`）④severity 与 failure 分开。

## 1. 结论模型（v1）

```js
Channel = {
  id,                       // 'codex' | 'dsh' | 'ingest' | 'plugin-bridge' | 'aa-backend'
  verdict: 'healthy' | 'failing' | 'undetermined',
  reachable: 'yes' | 'no' | 'unknown',   // 网络层
  usable:    'yes' | 'no' | 'unknown',   // 业务层：同步是否真的成功
  history: [{ from, to, verdict }],       // ← v1 新增：同一通道可先故障后恢复
  lastFailureAt, recoveredAt,             // 两个标量，供 --as-of 判定
  missing: string,                        // verdict=undetermined 时必填
  evidence: [{ file, sha256Prefix, line, text }],
  falsifier: string,
}
```

**硬规则**：可达与可用两栏永不合布尔；每条结论必须有 `falsifier`；证据必须带文件与 sha256 前缀。

## 2. 作用域（**待用户决定，SDS 不假定**）

审核指出这条只能用户定：诊断是对「文件集合里出现过的记录」下结论，还是对「机器此刻状态」下结论？

| 模式 | 语义 | 对今天语料的后果 |
|---|---|---|
| `--all`（默认） | 集合内出现过即算 | dsh = failing（93 条 ERROR 存在过），A 用例成立 |
| `--as-of <ts>` | 指定时点的状态 | 取 08:47:17Z 会是 healthy（末条 sync.ack），与 A 冲突 |

SDS 要求：两种模式都实现，**默认 `--all`**，并在结论里标注所用模式；`--as-of` 在无数据时输出 undetermined。
（这条是 docs/91 决策 9，用户未答。）

## 3. 语料契约

```
tests/corpus/2026-10-31/
  logs/aa/        10 文件  9,225 条（seq 唯一）   ← 故障期证据
  logs/control/    1 文件  1,014 条（0 ERROR）    ← 健康对照，禁止与 aa 同扫
  logs/plugin/     2 文件     80 条               ← 插件侧 PARSE_ERROR
  manifest.json    完整 64 位 sha256
```

扫描规则（写进 S1，不靠自觉）：只认 `logs/{aa,control,plugin}/*.jsonl`；`manifest.json` 永不入解析；
`aa` 与 `control` **永不同一次调用**（否则 10,239 ≠ 9,225）。

## 4. S1 接口（导出，不打印）

```js
readRecords(paths) -> Record[]
Record = { file, line, sha256Prefix, ts /* ISO-UTC 统一 */, level, source, name, eventCode, message, exception }
```

- **去重**：按 `seq`（无 seq 则 `eventId`）跨文件去重；
- **时区**：`+08:00` 与 `Z` 统一转 UTC；
- **完整性**：与 manifest 的 sha256 前缀比对，不匹配即报 `corpus-drift` 并拒绝出结论；
- 现有 `tools/log-format.mjs` 是**打印器**，其 `slice(-28)` 截断会对 S2 造成误匹配 → S1 必须独立实现，
  `log-format.mjs` 后续改为调用 S1。

## 5. S2 接口（纯函数，零 I/O）

```js
classify(record) -> { channel, signal, severity }   // severity: 'error' | 'warning' | 'info'
aggregate(records, { mode }) -> Channel[]
```

**severity 与 failure 分开**：`ingest request failed` 112 条里 72 条 WARNING、40 条 ERROR，
按 `level==='ERROR'` 筛会漏掉整条通道。`failure = signal 属于失败信号集合`，与 severity 无关。

## 6. 验收（对 corpus，按 §2 作用域执行）

| 用例 | 输入 | 必须输出 |
|---|---|---|
| A 双故障 | `logs/aa`（`--all`） | codex=failing、dsh=failing，且 dsh.history 含 07:46–08:37Z |
| B 方法错误 | 命令留档 | verdict=undetermined，注明「探测方法错误（缺 CA）」 |
| C 健康 | `logs/control` 单独 | **全部 healthy**，任何红即假阳性 |
| D 判不出 | aa-backend 可用性 | undetermined + `missing` |
| E 漂移 | 篡改任一文件一个字节 | `corpus-drift`，拒绝出结论 |

E 是用来防「改语料凑答案」的，v0 没有，v1 必须加。

## 7. 分阶段

| 阶段 | 交付 | DoD |
|---|---|---|
| S1 | `tools/lib/records.mjs`（readRecords + 去重 + TZ + manifest 校验） | `logs/aa` 得 9,225；`logs/control` 得 1,014；篡改触发 drift |
| S2 | `tools/lib/classify.mjs`（classify/aggregate 纯函数） | codex 236 / dsh 93 / ingest 112（72 warn + 40 err）/ plugin 32 |
| S3 | `tools/diagnose.mjs`（入口 + JSON 契约 + `--all`/`--as-of`） | A/B/C/D/E 五用例逐行过 |
| S4 | 面板只读渲染 S3 的 JSON | 同一 sha256 证据，面板不重算 |

## 8. 仍未定（用户决策）

- 决策 9：作用域 `--all` 还是 `--as-of` 为默认（SDS 暂定 `--all`）；
- docs/91 的 8 条旧决策仍未答。
