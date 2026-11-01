# 按 handoff 做的第一轮（2026-11-01）

来源：`docs/154-remaining-work-handoff.md`（kimi 分支的交接清单）。这轮只做能拿证据的三项。

## P0-1 真实 mini 端到端验收 ✅

新增 `tools/acceptance-mini.mjs`：**装 → 六级 → 卸 → 回滚确认**，四段全做，产出机器可读证据。

```bash
node tools/acceptance-mini.mjs <name> --mini <mini-root> [--json] [--out <file>]
# 统一入口：turnstile acceptance <name> --mini <root>
```

实测（mini 18770）：

```
  ✓ create            pass  <home>\Temp\acc-demo
  ✓ install+verify    pass  verified-with-regression（L0–L5 全过）
  ✓ uninstall         pass  bundles 32→31，node_modules/acc-demo 已删
  ✓ rollback-verified pass  路由 404，dump-config 里 已无
验收通过 · 证据：…\state\acceptance\mini-acc-demo.json
```

关键点：**卸载是真删目录 + 移出 bundles**，然后**重启**再确认路由 404 且 `--dump-config` 里没有它——
不是只看配置文件改没改。

## P0-4 CI 覆盖与失败纪律 ✅

`.github/workflows/selftest.yml`：

- 删掉 `semver-drift ... || true`（handoff 点名的那处吞失败）
- 新增 `contract + evidence + run route` 步骤：`test-report-contract` / `test-evidence` / `test-verify-live` / `test-trial-wiring` / `run-route`
- 新增 `release check`：`node tools/release-check.mjs --pack --json`

## P0-5 未保存修改保护 ✅（部分）

`builder.html` 现在：

- 保存点用**页面 JSON 摘要**比对（不是时间戳），撤销回保存点不会误报脏
- `beforeunload` 拦关闭/刷新，并设 `document.body.dataset.dirty` 供 UI 与测试观察

未做：切模板/跳历史前的脏提示（需要按入口逐个加确认）。

## 测试

```
test-acceptance   8 条（四段齐全 / 真删目录 / 404 / dump 无它 / 证据落盘 / 不等同桌面 / 缺参数报错 / 退出码）
test:all          31 套件全绿
e2e-builder       BUILDER_E2E_OK
e2e-console       98/98
```

## 仍未做（handoff 剩余）

| 项 | 状态 |
|---|---|
| 真实桌面端 / 对话技能验收 | ❌ 需要重启你的桌面 profile，我不擅自动 |
| 版本兼容矩阵（rc.4/rc.5/0.2.2-alpha.2） | ❌ 仍 unknown |
| 多标签页 stale 检查（页面版本/哈希） | ❌ 未做 |
| 多选复制粘贴 / 原子删除 / 批量移动 | ❌ 未做 |
| 页面树严格校验 + schema 迁移 | ❌ 未做 |
| 视觉令牌 / 响应式 / 可访问性 / 截图 | ❌ 未做 |
| 证据词统一（host-evidence 并入 L2/L3） | ❌ 上一轮提出，仍未做 |
