# 实施日志（按 SDS 分阶段，全部实测）

| 阶段 | 文件 | 状态 | 证据 |
|---|---|---|---|
| S1 | `tools/lib/records.mjs` | ✅ | aa 9,225 / control 1,014 / plugin 80；同扫去重 1,014；改一字节 → drift |
| S2 | `tools/lib/classify.mjs` | ✅ | codex 236 / dsh 92 / ingest 173（124+49）/ plugin 32；健康对照零失败 |
| S3 | `tools/diagnose.mjs` | ✅ | A/B/C/D/E 五用例全过（`tools/test-diagnose.mjs` 6 checks） |
| S4 | 面板接入 | ⬜ 未开始 | — |

## diagnose 的输出形态（真实运行）

```
$ node tools/diagnose.mjs --corpus tests/corpus/2026-10-31
✗ codex         failing  failures=236 {"unknown-variant":236}
    证据 runtime-...0001.jsonl:23  session sync failed
    推翻条件 出现 codex 的 sync completed 且无 unknown variant 记录
✗ dsh           failing  failures=92  {"sync-failed":92}
✗ ingest        failing  failures=173 {"ingest-failed":124,"sync-interrupted":49}
✗ plugin-bridge failing  failures=32  {"parse-error":32}
修法: · codex-cli 与 AA connector 协议不兼容 …
      · 检查出站：把 agents-anywhere.com 写入 NO_PROXY 后重启 AA
结论: failing      exit=1
```

## 真机 live 模式（2026-10-31 深夜）

```
$ node tools/diagnose.mjs --live
aa 10 文件 / 9173 条      plugin 2 文件 / 80 条
codex failing 89 · dsh failing 62 · ingest failing 88 · plugin-bridge failing 32
```

**注意**：live 的数字与 corpus 不同是正常的——线上日志还在增长并轮转，corpus 是 16:5x 的冻结快照。
验收只认 corpus（`--corpus`），live 只用于现场判断。

## 与旧工具的关系

| 旧 | 新 |
|---|---|
| `log-format.mjs`（打印格式） | 保留，但 S1 已导出 `readRecords`，后续改为调用 S1 |
| `doctor/preflight/engines/...`（静态查 profile） | 不动；diagnose 补的是「日志 + 网络 + 版本」这一层 |
## S4 面板接入（已完成，实机验证）

```
GET /turnstile/diagnose   插件 host 路由，复用 tools/lib/{records,classify}.mjs（不重写一遍）
面板「诊断（日志+通道）」卡片：跑诊断 → 结论 + 4 个通道 + 证据文件:行 + 推翻条件
```

实机（mini，2026-10-31 17:10）截图 `state/steward-diagnose.png`：

```
结论：failing（9,929 条记录 / 12 个文件）
✗ codex · failing · 失败 109
✗ dsh · failing · 失败 62
✗ ingest · failing · 失败 88
✗ plugin-bridge · failing · 失败 32
```

console e2e 68 → **71/71**（新增三条：结论、证据、推翻条件都要显示）。

### 顺手修掉的一个假报

体检卡原来固定查 `~/.agents-anywhere/dsh-bridge/endpoint.json`，而 2.x 插件实际写的是
`<DSH_HOME>/agents-anywhere/bridge/endpoint.json`，于是永远报「AA 卡在等待本地 bridge」。
现在两处都查，以先存在的为准。**这是「教程路径 ≠ 新版本路径」的第二个实例**。

## 阶段总览

| 阶段 | 状态 | 测试 |
|---|---|---|
| S1 records | ✅ | test-records 9 checks |
| S2 classify | ✅ | 同上（含计数契约） |
| S3 diagnose CLI | ✅ | test-diagnose 6 checks（A/B/C/D/E） |
| S4 面板 | ✅ | console e2e 71/71 + 实机截图 |
