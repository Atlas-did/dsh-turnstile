# mini 页面搭建器（这次真的从零做了一个）

## 先回答你的问题：之前有没有页面搭建器？

**没有。** 代码审计：`lib/console-designer.js`（448 行）是**插件配置的命令设计器**——
它做的是「停用/启用插件、改位置」这类操作的命令列表 + 撤销/重做 + 已保存状态的跳转。
它没有画布、没有组件树、没有拖放、没有属性面板，**不是页面搭建器**。

所以我们把 wxFormBuilder 与 Designable 的两条机制**真正做成一个搭建器**：

```
lib/page-model.js   数据层：组件注册表 + 能力声明 + 命令 + 命令栈 + 快照（纯数据，可在 node 里测）
lib/builder.html    画布：调色板 / 画布 / 属性检查器 / 快照列表
路由                GET /turnstile/builder、GET /turnstile/page-model.js、GET|POST /turnstile/page
```

## 抄机制的三处（对应你点名的两个项目）

| 机制 | 来源 | 在这里怎么体现 |
|---|---|---|
| 对象树 + 属性检查器（类型/默认值/枚举） | wxFormBuilder | 选中节点 → 右侧按 `propsSchema` 生成控件；标签上写明 `类型 · 默认值`；数字有 min/max，枚举出 select |
| Sizer 布局 | wxFormBuilder | `stack`（行/列 + gap）、`grid`（列数 + gap），画布按声明真实排版，不是绝对坐标 |
| 命令栈 + 保留快照 | wxFormBuilder | 每次提交进 `past`，同时留一份深拷贝快照；**能撤销，也能跳到任意快照**（跳完仍可撤销） |
| 组件自己声明能力 | Designable | `capabilities.draggable / acceptsChildren`；叶子组件的落点直接拒绝，**并说明原因** |
| 设置面板由 schema 生成 | Designable + Formily | 加一个组件只需要在 `COMPONENTS` 里写 `propsSchema`，面板自动多出控件 |

## 实机验收（`tools/e2e-builder-offline.mjs`，11 条全过）

```
ok   palette lists components
ok   the root node renders
ok   drag-drop adds the component          ← 真 HTML5 拖拽（dragTo）
ok   inspector change reaches the canvas   ← 改属性后画布立刻变
ok   out-of-range value is refused with a reason
ok   undo removes the last add
ok   redo restores it
ok   snapshots are listed
ok   jumping to a snapshot works
ok   saving posts a page with schema+root
ok   no uncaught errors
BUILDER_E2E_OK
```

数据层另有 14 条单测（`test/page-model.test.mjs`）：能力拒绝、类型强制、范围校验、
子树检查、撤销/重做、快照跳转、根节点不可删。

## 两个操作路径（为了「快」）

1. **拖**：从左侧拖到任意容器上（容器会亮黄边）；
2. **点两下**：点组件 → 点目标容器（触屏/键盘友好，也方便自动化）。

## 已知限制（不装懂）

- 页面存在 `state/page-<profile>.json`，**不会**影响插件加载；目前只是「画出来的页面」，
  还没有「把它当成一个真正的 DSH 页面渲染进宿主」的能力。
- 组件只有 6 种（heading/text/panel/stack/grid/stat），没有表格、图表、图片。
- 没有样式面板（颜色/字体），只有结构属性。
