# 搭建器响应式与窄屏抽屉（2026-11-01）

上一轮只加了 CSS 规则，界面上没有入口。这轮把入口做出来，并把「窄屏不丢功能」验证到浏览器里。

## 改动

| 项 | 内容 |
|---|---|
| 布局 | `≤900px` 时三栏改**单列**，`.palette` / `.inspector` 默认隐藏 |
| 入口 | 工具栏新增「组件」「属性」两个按钮（`data-testid=toggle-side` / `toggle-inspector`，仅窄屏显示） |
| 抽屉 | 点按钮加 `body.tier-drawer-open` / `tier-sheet-open`，两者互斥；`Esc` 关闭 |
| 宽屏 | 恢复三栏，两个开关自动隐藏 |

## 浏览器实测（390×760）

```
ok  narrow layout hides the side panels by default
ok  side drawer opens from the toolbar
ok  inspector sheet opens and replaces the side drawer
ok  Escape closes the narrow drawers
ok  wide layout shows both panels again   （1280×900 回切）
BUILDER_E2E_OK
```

## 途中修的一个真 bug

第一版把 `.tier-toggle{display:none}` 写在 media query **之后**，同权重后者覆盖前者 →
窄屏时开关按钮自己也被藏了，等于「有抽屉但没入口」。改成先隐后显的顺序。

**这条正是靠浏览器断言抓到的**（`narrow layout hides...` 先红）。

## 测试

```
test:all           37 套件全绿
e2e-builder        BUILDER_E2E_OK（含 5 条窄屏/抽屉断言）
e2e-builder-console BUILDER_CONSOLE_E2E_OK
```

## 仍未做

- 两端内联颜色还没全部换成 `tokens.css` 的变量（现在保证定义统一 + 关键焦点/抽屉规则共用）；
- 控制台的窄屏侧栏还没加同样的开关按钮；
- 对齐线 / 落点提示；
- 真实截图人工验收。
