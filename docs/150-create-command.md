# `turnstile create`：创作闭环一条命令（2026-11-01）

把「新建 / 导出 → 试装 → 六级验证」串成一个编排器，**任一段失败就停并说明停在哪**。

```bash
node tools/create-loop.mjs <name> [--dir <parent>] [--template ui-page|route] \
     [--from-page <page.json>] [--mini <mini-root>] [--keep] [--dry-run] [--json]
# 统一入口：node tools/turnstile.mjs create <name> --dir <parent> --mini <root> --dry-run
```

## 三段

| 段 | 做什么 | 失败会怎样 |
|---|---|---|
| create | `new-plugin` 或 `builder-export`（给了 `--from-page`） | 停在 create，附最后一行错误 |
| trial | `sandbox-trial --mini`（自动重启 + 取 token + 六级） | 停在 trial，附 claim |
| report | 输出 `{ok, claim, claimText, steps[], next[]}` | — |

## 实测

成功：

```
$ node oss/dsh-turnstile/tools/create-loop.mjs demo-two --dir %TEMP% --mini <mini> --keep
  ✓ create   pass  <home>\Temp\demo-two
  ✓ trial    pass  verified-with-regression
结论（verified-with-regression）：六层全部通过：加载、路由、界面可见，且原有功能未回归。
```

没给 `--mini`（诚实降级）：

```
  ✓ create   pass  …
  · trial    skip  没给 --mini，只能验到文件层
结论（static-only）：插件已生成，但没连 mini，只证明文件写了，不能认为可用。
```

失败（停在第一段）：

```
  ✗ create   fail  包名要不合法：小写字母开头，只允许 a-z 0-9 -
结论（failed）：新建/导出失败：包名要不合法…
```

## 注册表

`create` 已进 `COMMANDS`（`mutating` + `drySafe`）：`node tools/turnstile.mjs create demo --dry-run` 先给计划。

## 测试

`tools/test-create-loop.mjs` **9 条**：dry-run 三段计划且不落盘、没 mini 时 static-only 且明说不能认为可用、
trial 段标 skip、非法包名退出码 1 且停在 create、失败原因可读、失败给 next。

```
test:all 22 套件全绿 · e2e-console 92/92
```

## 仍未做

- 搭建器 UI 里还没有这几个按钮（全是命令行）；
- `--from-page` 走 `builder-export`，但没有把「搭建器当前内存里的页面」直接喂进来（要先存成 page.json）；
- mini 里现在留着 `demo-widget` 做展示，清理见 `docs/149`。
