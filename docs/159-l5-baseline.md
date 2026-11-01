# L5 回归基线进验收（2026-11-01）

上一轮 claim 只到 `verified`（L5 unknown）。这轮把**装前基线**补进来，真实 mini 上拿到完整 `verified-with-regression`。

## 新增两步

| 步骤 | 做什么 |
|---|---|
| `l5-baseline` | 装前用 `scanUi` 记一份 **UI 面快照**（哪些面、各有哪些插件） |
| 复判增强 | 用 `lab-reload --no-restart` 取 token（**不会把宿主再重启一次**），带 `--surfaces-before` 让 L5 做真对比 |

L5 的判据：装前存在的插件在装后**消失** → fail；health 任一条 fail → fail；其余 pass。

## 实测（mini 18770）

```
  ✓ create            pass  ...\Temp\acc-l5
  ✓ l5-baseline       pass  ...\.acc-l5-surfaces-before.json
  ✓ host-observe-before pass
  ✓ install+verify    pass  verified-with-regression
  ✓ host-observe-after pass   ...\.acc-l5-host-evidence.json
  ✓ verify-with-host-evidence pass  verified-with-regression / L2=pass：bootId e49935→717db8 已重启
  ✓ uninstall         pass  bundles 32→31
  ✓ rollback-verified pass  路由 404，dump-config 里 已无
```

**这次是完整的 `verified-with-regression`**，而且每层都有来源：

| 层 | 判据来源 |
|---|---|
| L0/L1 | profile 的 bundles + node_modules |
| L2 | **host-evidence 的 bootId 差异**（不是 dump-config） |
| L3 | 活宿主 HTTP 200 |
| L4 | 页面正文含包名 |
| L5 | 装前 UI 面基线对比 + health 全 pass |

## 测试

`test-evidence-unify` 加到 **17 条**：新增「验收器采 L5 基线」「复判传 --surfaces-before」「复判用 --no-restart（不重复重启）」等。

```
test:all     32 套件全绿
e2e-console  98/98
```

## 仍未做

- 桌面端验收（需要重启桌面 profile，我没动）；
- L5 只比「插件有没有从面里消失」，没比「面内数量变化是否异常」；
- 摘录仍是整页前 800 字。
