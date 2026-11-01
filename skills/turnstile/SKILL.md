---
name: turnstile
description: >
  主环境插件体检 / 槽位占用 / 快照 / 装插件 / 回滚 / 推主环境的统一入口。
  触发词：体检、插件状态、谁占了、槽位、装插件、回滚、推主环境、环境坏了、health、rollback。
---

# turnstile：插件体检与闸门

所有命令都走一个入口：`node tools/turnstile.mjs <子命令>`。带 `--json` 时返回统一契约，
**agent 一律用 `--json`**，别读终端文本。

## 契约长什么样

```json
{ ok, verdict, summary, findings[], evidence[], next[], rollback?, exitCode, durationMs }
```

- `verdict`：`ok` / `warn` / `fail` / **`unknown`**（数据不足就是 unknown，不要猜）
- `next[]`：每项 `{label, command, mutating, reason}`，command 可原样执行——**下一步靠它指路**
- `findings[]`：每项带 `falsifier`（什么情况下这条是误报）

## 工作流

1. **意图不清**：先 `node tools/turnstile.mjs ask "<用户原话>"` 拿建议命令，转述给用户确认。
2. **只读类**（`doctor` / `gate` / `surfaces` / `slot-report` / `inspect` / `diagnose` / `snapshot diff`）：
   带 `--json` 跑，把 `verdict` 与 `findings` 讲成人话，**不要贴原始 JSON**。
3. **写操作**（`snapshot-take` / `manage-enable` / `manage-disable`）：
   必须先 `--dry-run` 拿 `applyToken`，把计划和影响面讲给用户，**等用户明说「确认」**，
   再带 `--apply --token <t>` 重跑；高危（`manage-disable`）还要 `confirm` 与目标名逐字一致。
4. **多步操作**（装插件 = preinstall → 试装 → 对比 → 推主环境）：按 `next[]` 一步步走，每步贴结果。

## 红线（硬性）

- **任何 mutating 命令，未经用户明确确认，禁止 `--apply`。**（代码层也有闸门：没有 token 会被拒）
- `verdict: unknown` 时**不擅自修复**，转述给人并停下。
- 高危操作（`manage-disable`、推主环境）先展示风险，再等确认。
- 报错是「缺依赖」时（`js-yaml` / `es-module-lexer` / `semver`），**先说这是环境问题**（`npm install`），
  不要说「工具坏了」。

## 渲染规范（给用户看的时候）

```
结论灯（绿/黄/红/灰）+ 一句话结论
→ findings 列表（每条一句话 + 证据折叠）
→ next 讲成「你可以说：…」而不是贴命令
→ 写操作附回滚点
```

## 常用对照

| 用户说 | 你跑 |
|---|---|
| 体检 / 环境还能用吗 | `turnstile doctor <profile> --json` |
| 谁占了顶栏 / 槽位冲突 | `turnstile surfaces <profile> --json` |
| 装之前有风险吗 | `turnstile preinstall <profile> <pkg> --json` |
| 拍个快照 | `turnstile snapshot take <profile> --dry-run --json` → 确认后 `--apply --token` |
| 回滚 | `turnstile snapshot list <profile> --json` → `snapshot diff` |
| 某个插件怎么插的 | `turnstile inspect <profile> <pkg> --json` |

## 相关技能

- `mini-lab`：实验场（mini）专属；本技能管主环境主线。
- `slot-audit`：槽位深挖（运行时每个插件插了哪些 slot）。
