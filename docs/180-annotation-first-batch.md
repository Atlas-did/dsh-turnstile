# 批注层最小改造：第一批四项（2026-11-02）

按 `annotation-minimal-plan.md` 实施 A–D 四个工作包。

## A. 精确点选 ✅

新增 `console-annotation-picker.js`（纯函数）+ `console-annotation-pick.js`（运行时）：

| 能力 | 实现 |
|---|---|
| 稳定选择器 | `id` → `data-testid` → `tag:nth-of-type` 链（最多 4 层） |
| 结构回退 | `domPath`（body 起的 nth-child 链） |
| 元素摘要 | 标签 + 文本（120 字）+ 取整矩形 |
| 排除批注自身 | `data-annotation-ui` 的节点不会被选中 |
| 不触发原按钮 | 捕获阶段 `preventDefault + stopPropagation` |
| Esc 只退出点选 | 草稿保留，侧栏回到打开状态 |

## B. 双向定位 ✅

- 编号来自**完整列表**（`annotationNumbers`），不是当前筛选结果
- 页面上为能解析到的元素生成编号标记，点击打开侧栏并滚到卡片
- 卡片「定位」优先按 `selector` → `domPath` → 业务对象，找不到时明确提示「原目标已变化」

## C. 草稿保护 ✅

- 完整草稿进状态（`kind/text/quote/target/page/capture`），按 profile 存 `turnstile.console.draft.<profile>`
- 关闭侧栏、Esc、刷新都不清空；重新打开提示「有未保存的草稿」
- 只有保存成功或明确放弃才清除；放弃非空草稿需二次确认
- Ctrl/⌘+Enter 保存，Shift+Enter 换行，`isComposing` 时不拦截

## D. 截图失败降级 ✅（第一版）

- `capture.state`：`none / pending / captured / failed / unavailable`
- 当前没有真实截图能力 → 默认 `unavailable`，界面显示「当前环境不支持截图」，不放假按钮
- 失败时卡片提供「重试截图」；图片句柄与 Base64 **不进 localStorage / Markdown**

## 测试

```
test-annotation-picker   12 条（选择器/路径/摘要/排除规则）
test-annotations         +15 条（新字段默认值、脏数据、Markdown 上下文、编号、草稿）
e2e-annotations         26/26（新增点选、草稿恢复、截图状态、标记定位）
test:all                53 个套件，exit 0
```

## 真机（mini 18770）

```
drawer: true
context: #connection · 数据已读取      ← 点选到了状态栏元素
capture labels: 1                    ← unavailable 状态如实显示
badges: 1                            ← 编号标记出现在元素右上角
errors: none
```

## 途中修的两个真问题

1. 独立控制台把新模块当**原始文件**返回，`export` 语法让页面直接报错 → 统一剥离 export。
2. 草稿恢复后输入框是空的：textarea 从来没有绑定 `draft.text` → 补 `value` 与 `input` 同步。

## 仍未做（方案里明确的后续独立项）

- SnapDOM／宿主截图适配器与隐私遮罩
- 多选、框选、箭头画笔
- 文字选区的 W3C 多重锚定
- 批注跨页面聚合导出
