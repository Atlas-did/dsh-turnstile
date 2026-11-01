# 写操作的 dry-run 现在给结构化计划（2026-11-01）

《下一步行动指南》步骤 2 的后半：`snapshot-take` / `manage-enable` / `manage-disable` 也要能出结构化 JSON，
这样智能体在对话里能真正「把计划讲给人听」，而不是只说一句「将执行 …」。

## 改动

| 文件 | 改法 |
|---|---|
| `tools/manage.mjs` | 新增 `--json`：dry-run 输出 `{action,target,row,file,plan[]}`，写入输出 `{ok,action,target,row,file,backup}`；已是目标状态时输出 `noop:true` + `plan` |
| `tools/profile-snapshot.mjs` | `--take --json` 输出 `{ok,file,at,bundles,surfaces,patchBytes}` |
| `tools/lib/commands.mjs` | 三个写命令 `json:true`；新增 `applyFlag`（manage 系要 `--yes` 才真写）；`snapshot-take` 标 `drySafe:false` |
| `tools/turnstile.mjs` | dry-run 时**先跑底层 dry-run 拿真实计划**（`plan` + `diff{file,action}`），跑不了就退化为一行说明 |

## 实测

```
$ node tools/turnstile.mjs manage-disable <fixture> plug-beta --dry-run
{ "ok": true, "dryRun": true,
  "plan": ["追加 - id: beta-row / disabled: true"],
  "diff": { "file": "…/cordis.patch.yml", "action": "disable", "target": "plug-beta" },
  "applyToken": "…" }
```

这正是「智能体能复述给用户」的东西：**哪个文件、改哪一行、对谁**。

## 三个坑（都是这轮踩到的）

1. **dry-run 不能真跑**：`snapshot-take` 的底层 `--take` 就是写操作，第一版 dry-run 直接建了一张快照。
   现在注册表用 `drySafe:false` 标住，计划阶段不跑底层。
2. **`--json` 抢跑**：`manage.mjs` 原来只要看到 `--json` 就输出「列表」并退出，写意图被吞掉。
   改成 `--json && !doDisable && !doEnable` 才是列表。
3. **测试污染夹具**：`test-cli-token` 会真写 `tests/console-fixture/cordis.patch.yml` + 留 `.bak-*`。
   现在复制到临时目录再跑，git 里那份永远干净。

## 测试

`test-cli-token` 8 条：无 token、dry-run 出计划、**计划是底层真实行改动**、**diff 带文件与动作**、
签发 token、执行、一次性、参数绑定。

```
test:all 15 套件 · e2e-console 89/89 · e2e-panel 42/42
```
