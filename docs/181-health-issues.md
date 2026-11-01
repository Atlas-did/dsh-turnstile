# 方案 02-A：诊断 issue 归一化（2026-11-02）

读 `module-plans/README.md` 与 `02-health-diagnostics.md` 后，先落地其中最小的地基：**统一 issue 对象**。

## 做了什么

新增 `plugins/turnstile-popup/lib/health-issues.js`：

| 能力 | 说明 |
|---|---|
| 稳定 ID | `credentials` → `env.credentials`、`plugin:x` → `plugins.plugin-state`、`pit:x` → `plugins.pit.x`；内容变化不改 ID |
| 严重度 | `fail→error`、`warn→warning`、`skip→unknown`；**pass 不生成 issue** |
| 证据 | `{source, observedAt, status, locator}`，并去掉疑似令牌（`token=***`） |
| 修复能力 | `repair.supported/command`；没有修复器就不给「准备修复计划」 |
| 三组 | `needsAction` / `needsReview` / `unknown` |
| 四段式 | `what / who / why / next` |
| 复检 | 只有重新采集到 pass 才 `resolved`；采不到证据或该项消失 → `recheck-required` |

接入点：`tools/console-data.mjs`（权威实现）→ 控制台与独立控制台同一份 `issues` + `issueGroups`。

## 一个诚实性细节

独立控制台没有宿主入口时，无法判断某个 bundle 是「宿主自带」还是「真缺」——
所以此时缺包 issue 的严重度是 **unknown**，而不是 error。带 `DSH_BIN` 时才升级为 error。

## 测试

```
test-health-issues        17 条（稳定 ID / 严重度 / 分组 / 四段式 / 复检 / 脱敏 / 坏输入）
test-console-data-issues   4 条（出口形状 / 无宿主时 unknown / 分组 / 详情）
test:all                  55 个套件 exit 0
```

真机数据（mini）：`issues: 2 {needsAction:0, needsReview:0, unknown:2}` —— 两个都如实是 unknown。

## 仍未做（方案 02 的后续）

- B：管家首页按三组重构（现在只提供数据）
- C：详情页四段式渲染
- D：修复 → 复检闭环接 UI（复检函数已有，未接按钮）
- `tools/doctor.mjs` 与 console 的 issue 输出还没合并到一个命令
