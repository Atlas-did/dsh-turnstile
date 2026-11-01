# 方案 02-B/C：管家三组 + 四段式详情（2026-11-02）

上一轮做了 issue 归一化（只有数据）。这轮把它变成用户能看到的界面。

## B：首页只保留三组 ✅

`/turnstile/health` 现在返回 `issues` 与 `issueGroups`（宿主和独立控制台同一份）：

```
需要处理 0 · 需要了解 0 · 尚无结论 1     ← mini 真机
```

「需要处理」= error；「需要了解」= warning；「尚无结论」= unknown（采集失败/证据不足）。
判据没变、不补默认通过项；pits（三大坑）单独保留在下方。

## C：四段式详情 ✅

每条 issue 可展开，固定四段：

| 段 | 内容 |
|---|---|
| 发生了什么 | issue 摘要（不先抛内部异常） |
| 影响谁 | domain / 对象 |
| 凭什么 | 来源 · 时间 · 状态 · 定位 |
| 下一步 | 有修复器才给「准备修复计划」，否则只给「查看建议」 |

## 验证

```
e2e-console-offline   104/104（新增三组与 issue 行断言）
test:all              55 个套件 exit 0
真机 mini             group sections: 3 / issue rows: 1 / errors: none
```

## 途中修的两个问题

1. 新 UI 早期把 pits 整段吃掉了 → e2e 立刻报 `health-pits` 找不到，补回「检查项（pits）」区块。
2. 同步白名单又漏了 `health-issues.js` → mini 起不来（这已是第三次漏文件，`test-sync-coverage` 只覆盖 index.js 的直接依赖，被 console-data 间接依赖的文件没被覆盖）。

## 仍未做

- D：修复 → 复检闭环的 UI（`recheckIssue` 已有，没有按钮）
- `tools/doctor.mjs` 还没输出同一份 issue
- 详情页还没有「查看证据」的独立面板（现在是内联文本）
