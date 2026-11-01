# 合并 kimi 分支（2026-11-01）

两条线首次合流：`merge/kimi` ← `838fa73`，随后 `bc87298` 修合并后的两个真 bug。

## 分歧

| | kimi 那条 | 我这条 |
|---|---|---|
| 基点 | `ae5365b` | `ae5365b` + 4 个提交 |
| 提交数 | 1（67 个文件压成一个 wip） | 4 |
| 强项 | 创作闭环 UI、host-evidence 契约、发布/扩展检查 | 真机六级、lab-reload、new-plugin、create 编排 |

## 6 个冲突的判法

| 文件 | 取谁 | 理由 |
|---|---|---|
| `package.json` | 并集 | 30 个测试套件两边都要跑 |
| `tools/turnstile.mjs` | **他们** | 已把参数解析收敛成 `parseCommandArgs`；补回 `profile` 透传 |
| `tools/lib/report.mjs` | **双向合并** | 我的 `humanSummary`/`agentPrompt`/`NEXT_BY_COMMAND` + 他们的 `data`/底层 `next` 透传/`evidence` 合并 |
| `console.html` | **他们**（分组导航） | 他们已用 `counts[id]??''`，但仍缺 launcher/skeleton 键 → 补上 |
| `sandbox-trial.mjs` | **我**（六级结论） | 保留他们的 `SKIP plugin-load` 诚实行 |
| `e2e-console-offline.mjs` | 保留一份 navText 断言 | 合并后重复声明 |

## 合并后修的两个真 bug

1. `passed` 在合并后同时被「六级结果」和「回滚结果」赋值，但声明是 `const` → 任何一次试装都抛
   `TypeError: Assignment to constant variable`（这次是真实跑 `create` 时抓到的，不是单测）。
2. 接了 `--mini` 之后仍打印「本工具没有重启真实宿主」——**已经是假话**，改成只在没 `--mini` 时打印。

## 验证

```
test:all            30 个套件全绿（两边的都在）
e2e-console         98/98
e2e-panel           42/42
e2e-builder         BUILDER_E2E_OK
e2e-builder-console BUILDER_CONSOLE_E2E_OK
```

真机（mini 18770，合并后的代码）：

```
$ node tools/create-loop.mjs merge-two --dir %TEMP% --mini <mini> --keep
  ✓ create   pass  C:\Users\...\Temp\merge-two
  ✓ trial    pass  verified-with-regression
  ✓ L0/L1/L2/L3/L4/L5 全部 pass（/merge-two → 200，页面含 merge-two）
结论（verified-with-regression）：六层全部通过：加载、路由、界面可见，且原有功能未回归。
```

## 仍未统一的地方（下一轮）

- 两套证据词仍并存：他们的 `trial-status`/`host-evidence`（bootId + 路由 hash）与我的 `L0–L5`。
  **门槛**：把 host-evidence 作为 L2/L3 的 provider，对外只留一套阶梯。
- 他们的 `verify-export` 隔离自检与我的 `verify-live` 真实宿主自检是两层，需要在 UI 上明确标注层级。
- kimi 分支的 67 个文件压成了一个 wip 提交，历史不可读；后续请按功能拆分提交。
