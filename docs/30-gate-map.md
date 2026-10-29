# 30 · gate map：可视化与溯源（2026-10-29）

一张自包含 HTML，回答四个问题：**谁盖了谁、哪里挤、哪里报红、能不能溯源**。

## 用法

```bash
node tools/gate-map.mjs <profileName> [--home <DSH_HOME>] [--out f.html]
node tools/mapshot.mjs <html> <png>      # 无头截图，用于评审/存档
```

产出：`state/gate-map-<profile>.html`（单文件，内联 CSS/JS，无外部依赖）。

## 六个区块

| # | 区块 | 回答什么 |
|---|---|---|
| ① | 覆盖链 | 同一个 row id 出现在多层时，**谁最后写、文件在哪**（点行弹出路径） |
| ② | UI 抢占面 | 一个界面被几个插件注入；>10 标红（对应闸门第 6 项），≥3 标黄 |
| ③ | 冲突扫描 | ctx 服务重复 / 版本分叉（来自 tools/conflict.mjs 实时输出） |
| ④ | 最近 40 次闸门 | **哪里报红**：时间 / profile / 结果 / 阻塞它的检查项 |
| ⑤ | 模型路由 | 每条 provider 路由与模型数，跨路由重名数 |
| ⑥ | 本 profile 时间线 | 只看当前 profile 的闸门历史 |

## 桌面实测（2026-10-29 22:45）

```
bundles 35 · 组合 158250 B (3.8% of 4 MiB) · 行 251
覆盖链：2 行（connection、vision-router）
UI 抢占：17 个面，最大 ui-settings 10 个插件
冲突：dep-divergence @deepseek-ai/schemastery 3.18.4 | 3.18.5
路由：5 条，跨路由重名 0
闸门：最近 40 次里 6 次 blocked（gate-fixture/import-fixture/mini 的 prompt-vars）
```

### 覆盖链只报 2 行，为什么值得看

`connection` 和 `vision-router` 都被 `dsh-vision-router` 用自己的旧 `inject` 覆盖，
profile patch 里再盖回来（patch 注释写明：DSH 0.2.1-rc.2 起是 `inject: [webStartup]`，
旧版是 `[webRuntime, webServer]`，直接覆盖会死锁）。

这就是「什么时候被盖了、为什么盖、在哪盖」的完整链条——可视化把它变成一行可点的记录。

## 一个必须记住的坑

第一版把 **preset 里的嵌套行**也当成了顶层覆盖，结果报出 35 行“被 dsh-vibe-math 覆盖”。
实际上那些是 preset 内部的子行（合法的作用域重复），不是全局覆盖。
修正：只匹配行首的 `- id:`（`^` 锚定、无缩进），desktop 立刻从 35 降到 2。

**教训：可视化报错了比不报更糟。** 任何聚合视图都必须先对齐 lint-rows 的作用域口径。

## 第二轮增强（2026-10-29 22:50）

| 项 | 做法 |
|---|---|
| **SVG 拓扑** | 左列插件 → 右列 UI 面，贝塞尔连线；线粗/红 = 该面被 >10 个插件注入 |
| **引擎跳过进图** | 拓扑右下角红框显示被 `engines.dsh` 拦下的插件（mini 实测显示 `跳过: dsh-talk`） |
| **点节点跳文件** | 插件框与覆盖链表里的路径都是 `vscode://file/<绝对路径>` 链接 |
| **接进 doctor** | doctor 末尾打印「详细视图: state/gate-map-xxx.html」 |

### 排版修正

插件名超过 24 字符截断（原本会压住右侧计数），跳过的插件单独占一行并用红框，
没有被跳过时打印「引擎闸门：无插件被跳过」，避免空白引起误读。

### 两个 profile 的差异（同一张图）

| | desktop | mini |
|---|---|---|
| UI 面 | 17 个，最大 ui-settings 10 | 14 个，最大 ui-conversation 8 |
| 覆盖链 | 2 行（connection / vision-router） | 0 行 |
| 引擎跳过 | 无 | dsh-talk |
| 闸门阻塞 | 0（最近 18 次全 clear） | 1（prompt-vars） |
