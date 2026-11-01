# 设计令牌与窄屏规则（2026-11-01，P3 第一步）

handoff P3：控制台有一套变量，搭建器是另一套内联样式；窄屏时面板直接藏没。这轮先解决**单一来源**这个根问题。

## 新增 `plugins/turnstile-popup/lib/tokens.css`

| 组 | 令牌 |
|---|---|
| 表面 | `--bg --nav --panel --raised --line` |
| 文本 | `--text --muted` |
| 语义色 | `--accent --ok --danger --warn` |
| **状态别名** | `--status-ok/warn/fail/unknown`（同一含义只用一个名字） |
| 间距 | `--s1…--s6`（4 的倍数） |
| 字号 | `--fs-xs/sm/md/lg/xl` |
| 圆角 | `--r-sm/md/lg`，`--shadow` |

另外两条共用规则：

- `:focus-visible` 统一焦点环（可访问性底线）
- `@media (max-width:900px)` 时侧栏/检查器变成 `.tier-drawer-open` / `.tier-sheet-open` 打开的抽屉，**而不是 display:none 藏掉**

## 接线

| 位置 | 改动 |
|---|---|
| `console.html` / `builder.html` | 各自 `<link rel="stylesheet" href="/turnstile/tokens.css">` |
| 插件的 webServer | 新增 `GET /turnstile/tokens.css`（`text/css`） |
| `console-server` | 同一路径；顺带把静态资源路由拆出 CSS 分支（以前一律当 JS 发） |

## 实测

```
ok  GET /turnstile/tokens.css 返回 200   200
ok  content-type 是 CSS 而不是 JS   text/css; charset=utf-8
ok  响应体就是令牌表
ok  窄屏有抽屉规则（不是直接藏）
ok  控制台/搭建器都引用了 tokens.css
TOKENS_OK
```

## 测试

```
test-tokens     12 条（令牌存在 / 焦点可见 / 窄屏抽屉 / 两端引用 / 真 HTTP 返回 CSS）
test:all        37 套件全绿
e2e-builder     BUILDER_E2E_OK
e2e-console     98/98
```

## 仍未做（P3 剩下的）

- 两端的内联样式还没全部换成令牌（现在只保证**定义**统一，视觉替换是下一步）；
- 窄屏抽屉的**开关按钮**还没做（CSS 规则已就位，但界面上没有「打开侧栏/检查器」的入口）；
- 搭建器仍固定三栏布局，未接响应式；
- 真实截图验收。
