---
name: turnstile
description: >
  用自然语言驱动插件体检、槽位占用、快照、页面创作、试装证据、回滚与推主环境。
  触发词：体检、插件状态、谁占了、槽位、制作插件、新建页面、上次试装、装插件、回滚、环境坏了、health、rollback。
---

# turnstile：对话优先的插件体检与创作闸门

普通用户只需对 DSH 智能体说自然语言，不需要开终端，也不必先打开面板。面板和控制台是可选的可视化入口，
不是必经路径。智能体负责调用工具、核对证据并把结论讲成人话。

所有命令都走一个入口：`node tools/turnstile.mjs <子命令>`。带 `--json` 时返回统一契约，
**agent 一律用 `--json`**，别读终端文本。

## 契约长什么样

```json
{ ok, verdict, summary, findings[], evidence[], next[], rollback?, exitCode, durationMs }
```

- `verdict`：`ok` / `warn` / `fail` / **`unknown`**（数据不足就是 unknown，不要猜）
- `next[]`：每项 `{label, command, mutating, reason}`，下一步靠它指路
- `findings[]`：每项带 `falsifier`（什么情况下这条是误报）
- `ask` 额外返回 `intent` 与 `actions[]`；动作形如 `{command, args, mutating, danger}`

## 对话主流程

1. 先运行 `node tools/turnstile.mjs ask <profile> "<用户原话>" --json`。
2. 读 `actions[]`，不要自己另拼旧脚本：
   - 只读动作可以带 `--json` 执行，再把 `verdict`、`summary` 和关键证据讲给用户。
   - `open-builder` 是界面动作：打开返回的 `/turnstile/builder`，**不要当成 shell 命令执行**。
   - `mutating:true` 只表示一个待确认计划，不能直接写入。
3. 写操作（`snapshot-take` / `anchor` / `fix` / `manage-enable` / `manage-disable`）：
   必须先对同一命令和参数 `--dry-run` 拿 `applyToken`，展示计划、影响面和回滚方式，**等用户明说「确认」**，
   再带 `--apply --token <t>` 重放。高危 `manage-disable` 还必须带 `--confirm <包名>`，与目标逐字一致。
4. 多步操作（装插件 = preinstall → 试装 → 对比 → 推主环境）：按 `next[]` 一步步走，每步说明证据。

### 用户可以这样说

| 用户原话 | 期望动作 |
|---|---|
| 帮我看看插件状态 | `doctor`，汇报整体状态和异常项 |
| 上次试装结果怎么样 | `trial-status`，解释最近一次 journal 证据 |
| 我想制作一个插件页面 | `open-builder`，打开 `/turnstile/builder` |
| 装 dsh-x 前有风险吗 | `preinstall`，只做装前检查，不安装 |
| 把 dsh-x 挪到左下角 | `anchor`，先 dry-run，再由用户确认 |

## 证据边界

- `trial-status` 的 `static-pass` 必须讲成：**静态通过；真实宿主插件加载未验证**。
- 静态检查、HTTP 200 或最小隔离宿主通过，都不等于真实 DSH 已加载成功。
- 补真实证据需要保留试装、重启真实宿主并检查目标路由；完成前不能声称试装成功。
- 用两阶段观察采集真实 mini 证据，采集器自身不启动或停止宿主：
  `host-observe before <profile> <pkg> --mini <dir> --out <observation.json>`，完成受控重启后运行
  `host-observe after <profile> <pkg> --mini <dir> --input <observation.json> --out <evidence.json>`。
- 适配器输出 `turnstile/host-evidence@1` 后，先运行
  `node tools/turnstile.mjs host-evidence <evidence.json> --json` 校验，再用
  `node tools/host-evidence.mjs <evidence.json> --record --state <state>` 追加到 journal。
- 证据必须绑定同一插件与 profile、晚于最近一次试装，并同时包含：真实运行时、不同 bootId 的重启、
  插件安装与 bundles 确认、目标路由 200、非空响应及 SHA-256。缺一项都保持未验证。
- 页面创作闭环是：搭建 → 保存/刷新恢复 → 预览 → 导出 → 隔离验证；真实宿主验收另算。

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
| 上次试装结果 | `turnstile trial-status <profile> --json` |
| 谁占了顶栏 / 槽位冲突 | `turnstile surfaces <profile> --json` |
| 装之前有风险吗 | `turnstile preinstall <profile> <pkg> --json` |
| 拍个快照 | `turnstile snapshot-take <profile> --dry-run --json` → 确认后 `--apply --token` |
| 回滚 | `turnstile snapshot-list <profile> --json` → `snapshot-diff` |
| 某个插件怎么插的 | `turnstile inspect <profile> <pkg> --json` |

## 相关技能

- `mini-lab`：实验场（mini）专属；本技能管对话主线与证据边界。
- `slot-audit`：槽位深挖（运行时每个插件插了哪些 slot）。
