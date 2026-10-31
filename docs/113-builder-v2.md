# 搭建器 v2：能渲染进宿主 + 表格/图表 + 样式面板

三件事都做了，且都在真机（mini，18770）验证过。

## ① 渲染进宿主（不再只是一个画布）

```
GET /turnstile/builder      画布（编辑，拖/点放置/改属性/改样式/撤销/快照/保存）
GET /turnstile/view         只读渲染 state 里的 page-<profile>.json
GET /turnstile/page         读/写页面 JSON（POST 校验 schema+root，写前备份）
GET /turnstile/page-render.js  画布与预览共用的渲染器
```

**在 DSH 窗口里打开**：面板工具栏新增「页面」按钮（`data-testid=page-open`），点一下把
`/turnstile/view` 用一个全屏 iframe 覆盖在宿主页面上——这就是「变成 DSH 的一个页面」，
不是另开浏览器标签。

## ② 新增组件

| 组件 | 属性 | 渲染 |
|---|---|---|
| `table` | `columns`（逗号分隔）、`rows`（每行一行，逗号分隔） | 真 `<table>`，带表头与分隔线 |
| `chart` | `kind`（bar/line）、`title`、`series`（每行 `标签:数值`） | 条形图：每行一条，宽度按最大值归一 |
| `image` | `src`、`alt` | **只允许 `http(s)` 或 `/turnstile/`**，其余显示拒绝原因 |

## ③ 样式面板

`STYLE_SCHEMA`（所有组件共用）：`padding`（0–48）、`align`（left/center/right）、
`tone`（none/panel/accent）、`width`（auto/half/full）。
属性检查器里分成两块：**属性**（组件自己的）与 **样式**（共用的），都从声明生成。

## 渲染器统一（这次修的一个结构性问题）

之前画布自己写一套渲染、预览没有。现在 `page-render.js` 一份：
`renderBody(node)` 给搭建器套可选中包装，`render(node)` 给只读页面用。
**画布与预览不可能再不一致**。

## 真机验证（mini）

```
builder          200  14,769B
page-model.js    200  11,893B
page-render.js   200   7,043B
view             200     886B

浏览器：拖入 table + chart + stat → 保存「已保存 22:17:15」→ 打开 /turnstile/view
        rows=2  chart=1  stat=1   （截图 state/builder-view.png）
```

## 测试

| 套件 | 条数 | 新增 |
|---|---|---|
| `test/page-model.test.mjs` | 14 → **20** | 表格/图表/图片/样式写入/未知样式拒绝/图表枚举 |
| `tools/e2e-builder-offline.mjs` | 11 → **14** | 表格渲染行、图表渲染条、样式对齐生效 |
| console / panel e2e | 76 / 29 | 未回归 |

## 踩到的一个「静默不生效」（值得记）

新路由全部 404/000，查了半小时：`tools/sync-live.mjs` 用的是**白名单文件清单**，
新建的 `page-model.js` / `page-render.js` / `builder.html` 没在清单里 → 从没被同步到运行目录。
已补进清单，并在工具里写了注释：**新增文件必须加进 FILES，否则静默不生效**。

## 仍然没做的

- 页面没有「登录/数据绑定」，只是静态内容；表格/图表的数据要手写。
- 只有 bar/line 两种图形（没有饼图/折线坐标轴）。
- 样式只有 4 项（没有颜色/字号的自由输入）。
