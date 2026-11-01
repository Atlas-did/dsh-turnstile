# 控制台窄屏抽屉（2026-11-01）

上一轮只做了搭建器。这轮把控制台补齐——它的 `.sidebar` 在 `≤680px` 时原来是**直接 display:none**。

## 改动

| 项 | 内容 |
|---|---|
| 规则 | `≤680px`：`.sidebar` 与 `.inspector` 都隐藏；由 `body.tier-drawer-open` / `tier-sheet-open` 打开 |
| 入口 | 顶栏新增「导航」「检查器」两个按钮（`toggle-nav` / `toggle-inspector`，仅窄屏显示） |
| 互斥 | 打开抽屉会关掉另一个；`Esc` 全部关闭 |

## 浏览器实测（390×760）

```
PASS  narrow console hides nav and inspector by default
PASS  nav drawer opens from the topbar
PASS  inspector sheet opens and closes the nav drawer
PASS  Escape closes console drawers
103/103 checks passed
```

## 现在两个界面的窄屏行为一致

| 界面 | 窄屏默认 | 抽屉入口 | Esc |
|---|---|---|---|
| 搭建器 | 面板隐藏 | 工具栏「组件/属性」 | ✅ |
| 控制台 | 侧栏/检查器隐藏 | 顶栏「导航/检查器」 | ✅ |

## 测试

```
test:all            37 套件全绿
e2e-console         103/103（新增 5 条窄屏断言）
e2e-builder         BUILDER_E2E_OK
```

## 仍未做

- 两端内联颜色还没全部换成 `tokens.css` 变量；
- 抽屉没有遮罩层（点空白处不关闭，只能 Esc 或再点按钮）；
- 对齐线 / 落点提示；
- 真实截图人工验收。
