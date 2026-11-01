# 149 · 统一命令解析与写入模式一致性

## 目标

统一 CLI、JSON CLI 和 `/turnstile/run` 必须共享命令声明与安全语义。入口层可以负责转发和报告，但不能因为解析方式不同而丢参数、误认位置参数或绕过写入闸门。

本轮只修改隔离副本；测试使用临时 profile 和 state，没有读取或修改真实 mini、主仓库或桌面 profile。

## 单一解析路径

`tools/lib/commands.mjs` 的 `parseCommandArgs()` 统一处理：

- `positional`：必需位置参数。
- `flagMap`：写操作的命名参数和兼容位置参数。
- `flags`：需要传入底层脚本并保留在统一 `args` 中的值选项，例如 `--map`。
- `valueFlags`：需要原样转发的值选项，例如 `--checks`、`--only`、`--lines`。
- `booleanFlags`：需要原样转发的布尔选项，例如 `--no-record`。

选项的值不再被当成位置参数，因此选项可以出现在 profile 前后。`turnstile.mjs` 的注册命令路由表直接从 `COMMANDS` 生成，旧入口单独保留；重复且不可达的 JSON 分派已删除。

统一报告的 `data` 保留底层完整结构化结果，调用方可以读取 `checks`、`plugins`、`blocking` 等明细，不必解析人读摘要。

## 写入模式不可省略

注册的写命令只有两种合法模式：

```text
--dry-run                       只生成计划并签发一次性 token
--apply --token <token>         明确确认后执行；高危命令还需 --confirm <目标>
```

没有模式、只有 `--json` 或只有裸 `--apply` 都会拒绝。特别是 `snapshot-take` 不能再通过普通 JSON 分派直接写快照。

`drySafe:false` 表示底层脚本没有安全的计划模式。CLI 和 `/turnstile/run` 都只生成命令计划，不执行底层脚本；token 确认后的 apply 才允许写入。

## 夹具验收

- `test:entry`：选项在位置参数前后都能解析；`inspect --lines` 和 `slot-report --map` 的完整 JSON 可用。
- `test:checks`：统一 `gate` 在 `--checks` 位于 profile 前时仍运行正确的外部检查器。
- `test:cli-token`：快照无模式／裸 apply 拒绝，dry-run 不写文件，带 token 执行后才写文件；既有 manage、anchor、fix 回归继续通过。
- `run-route.test.mjs`：路由 dry-run 不写快照，apply 后才写；测试 profile 和 state 均改为临时副本，避免污染仓库夹具。

这些是隔离夹具和进程级契约证据，不代表真实 mini 或桌面端端到端验收。
