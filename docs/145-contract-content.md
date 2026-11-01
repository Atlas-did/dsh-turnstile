# 契约层「有壳没内容」的修复（2026-11-01 实测反馈）

外部实测指出四个真问题，逐条修：

## A. `summary` 不是人话

`report.mjs` 原来把脚本的 `summary` 原样透传，`doctor` 给的是 `"warn"`。
现在：状态词（ok/warn/fail/clear/blocked/unknown）一律不采纳，改成人话：

```
通过：依赖风险检查没有发现问题。
基本可用：整体体检发现 1 条需要看一眼（不阻塞）。
需要看一眼：门禁检查有 3 条问题，其中 1 条较严重。
数据不足：诊断没能给出结论（缺证据，不要据此修复）。
```

## B. `next[]` 自指 + 占位符

原来对 ok 命令一律推 doctor，命令本身是 doctor 时就原地打转；且 command 里带 `<profile>` 占位符，
违背契约注释里「可原样执行」的承诺。现在：

- 每个命令一张显式表（doctor → gate；gate → doctor/fix；check-* → gate/doctor；surfaces ↔ slot-report…）
- **过滤掉指向自己的那一条**
- profile 从参数回填：`node tools/turnstile.mjs gate tests/console-fixture`

## C. `agentPrompt` 零生产者

`normalizeFinding` 现在**生产**这段提示词（03 §4 的「AI 修复提示词」）：

```
你在 DSH 的 turnstile 语境里，目标 profile：mini。问题：beta-row 被手动停用。
证据：cordis.patch.yml。请先用只读命令确认，再给最小改动方案；写操作必须先 dry-run，
等用户确认后才 --apply。如果启用后本条消失，说明这条是误报，直接告诉用户忽略。
```

## D. 命令名双轨（`check risk` vs `check-risk`）

`turnstile.mjs` 在分派前归一：`check <x>` → `check-<x>`。
实测 `check risk --json` 现在返回契约（之前是 `risk.mjs` 的原始 envelope）：

```
{ "command": "check-risk", "summary": "通过：依赖风险检查没有发现问题。",
  "next": [{ "command": "node tools/turnstile.mjs gate tests/console-fixture" }] }
```

## E. doctor 没接缺依赖闸门

`doctor.mjs` 原来在顶层 `loadYaml()` 就崩（`js-yaml` 缺失时），输出是 verdict:fail + 一行文件路径。
现在包 try/catch：缺依赖时输出

```json
{ "verdict": "unknown", "skipped": true, "skipReason": "missing-dependency",
  "summary": "缺少依赖 js-yaml：在仓库根跑 npm install …。这是环境问题，不是插件有问题。",
  "next": [{ "label": "装依赖后重试", "command": "npm install" }] }
```

## 测试

`test-report-contract` 新增 5 条：summary 不是状态词、doctor 的 next 不自指、next 回填真实 profile、
agentPrompt 有内容且点名 profile、gate 的 next 指向 doctor 而不含自己。

```
test:all 16 套件全绿 · e2e-console 89/89 · run-route 10 条
```

## 仍未做

- `check-risk` 的 finding `title` 在真有问题时仍带 `RED`/`AMBER` 字样（来自 risk.mjs 本身，未改写）；
- `summary` 的「较严重」判断依赖 finding 的 severity 字段，risk.mjs 目前不输出 severity，
  所以它的问题会被算进 n 但不算 errs——**这是已知的粗糙点**。
