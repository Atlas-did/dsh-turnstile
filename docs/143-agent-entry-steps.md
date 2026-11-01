# 让对话入口真正可用（《下一步行动指南》落地，2026-11-01）

## 步骤 0：CLI 接上统一契约

`tools/turnstile.mjs`：注册表里的命令 + `--json` → `runCommand` + `shapeReport`，输出
`{ok,verdict,summary,findings,next,rollback?}`；**不加 `--json` 时行为零变化**（仍是 `stdio:'inherit'` 透传）。

```
$ node tools/turnstile.mjs inspect tests/console-fixture plug-alpha --json
{ "ok": true, "verdict": "ok", "findings": [], "next": [ { "label": "看整体状态", … } ] }

$ node tools/turnstile.mjs inspect tests/console-fixture plug-alpha   # 与改动前逐字一致
插件 plug-alpha @1.4.0
```

## 步骤 1：skills/turnstile/SKILL.md

触发词 + 工作流 + 红线（写操作未经确认禁止 --apply、unknown 不擅自修、缺依赖先说是环境问题）。

```
$ node tools/skill-pack.mjs lint skills/turnstile
OK   turnstile  (1 文件, 3KB)
```

## 步骤 2：JSON 覆盖 + 三查入表

| 命令 | 之前 | 现在 |
|---|---|---|
| doctor | 只有文本 | 新增 --json（静音人类输出，只打 JSON） |
| surfaces / preinstall | 有 --json 但注册表写 false | 改 true |
| check-risk / check-conflict / check-engines | 完全不在注册表 | 已加入 |

实测（fixture）：doctor ok findings=1 / surfaces ok / check-risk ok / check-conflict ok / check-engines ok。

途中修的 bug：doctor 的「位置参数传目录」其实没生效——设了 dir 之后又拼 <home>/profiles/<name>，
所以 doctor <path> 必挂。改成 dir || join(home,'profiles',name)。

## 步骤 3：CLI 侧 applyToken

新模块 tools/lib/apply-token.mjs；run-route.js 改为共用（不再各写一份）。

**关键修正**：token 必须落盘。CLI 每次调用是新进程，内存 Map 跨进程永远验不过——
第一版就是这样，dry-run 拿到的 token 在下一个进程里必然「无效」。现在存 <state>/apply-tokens.json。

实测：

```
写操作无 token   → exit 2  拒绝：先 --dry-run 拿 applyToken
dry-run          → 计划 + applyToken（绑定 command+args 哈希）
带 token         → 执行成功，输出契约 JSON
复用同一 token    → exit 2  token 无效或已过期
换目标用旧 token  → exit 2  token 与本次参数不匹配
```

顺带：manage-disable <profile> <pkg> 的包名现在可按位置传（以前只认 --package）。

## 测试

```
test-cli-token   6 条（无 token / dry-run / 执行 / 一次性 / 绑定参数 / 拒绝原因）
test:all        15 套件全绿
e2e-console     89/89
e2e-panel       42/42
```

## 仍未做

- 步骤 4（README 改「你只要会说话」开头）还没动；
- snapshot-take / manage-* 的写操作还缺 --json 结构化计划（现在 dry-run 只给一行「将执行」）；
- skills/turnstile 在真实 DSH 会话里能否被触发，未验证（需要重启主环境看技能目录）。
