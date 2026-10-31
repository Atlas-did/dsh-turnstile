---
name: slot-audit
description: >
  用你自己的 DSH 跑一遍「插件到底插了哪些 slot」的采集与报表：打开页面 → 页面自报 slot 快照 →
  生成「每插件 × 每 slot」分布表。适合想核查某个插件是否在抢位置、或排查 UI 冲突。
  触发词：slot 审计、谁插了哪、占位检查、插件占了什么位置。
---

# slot 审计（在你自己的 DSH 上跑）

## 它回答什么

「这个插件到底插了几个位置、插在哪」——而不是只看它 package.json 里声明的 `inject` 面。

## 三步

### 1. 打开一次 DSH 页面（让客户端上报）

装了 turnstile-popup 的环境里，页面加载时客户端会把 slot 快照 POST 到宿主，
落盘为 `<state>/slot-map-<profile>.json`。

```bash
# mini 环境（如果装了 mini-ctl）
node tools/mini-ctl.mjs url      # 拿到带 token 的地址，浏览器打开、等 10~20 秒
```

没有 mini 的，直接用你日常的 DSH 地址打开一次即可。

### 2. 生成分布表

```bash
node tools/slot-map-report.mjs --map <state>/slot-map-<profile>.json
node tools/slot-map-report.mjs --map … --plugin dsh-better-sidebar   # 只看一个插件
node tools/slot-map-report.mjs --map … --json                        # 给程序读
```

输出示例（真实数据）：

```
dsh-better-sidebar  ·  15 条 · 4 个位置
      6  sidebar.right.pane.tab        dsh-better-sidebar:editor, :git, :subagent …
      6  sidebar.right.pane.tab.title  dsh-better-sidebar:editor, …
      2  conversation.session.header.utilities  …:bottom-toggle, …:context-diagnostics
      1  shell.overlay                 …:context-diagnostics
```

### 3. 读结果

- 一个插件在**多个 slot** 里各插一条是正常的（标题 + 内容 + 角标）。
- 两个插件抢**同一个 slot** 才可能冲突——用 `node tools/ui-surfaces.mjs <profile>` 看同一个面上有谁。
- `(核心/未归属)` 那行是 DSH 自己的条目（`bash`、`user`、`permission`），不是插件，别慌。

## 采集不到怎么办

| 现象 | 原因 | 处理 |
|---|---|---|
| 没有 `slot-map-*.json` | 面板没挂载 / 客户端没上报 | 打开一次 DSH 页面并停在主界面 20 秒 |
| 文件里 `slots: []` | 页面刚启动，插件还没注入 | 等 4 秒后客户端会补报一次 |
| POST 返回 401 | 该路由需要 token 或该环境未豁免 | 用带 token 的 URL 打开；宿主侧见 docs/125 |

## 归属规则（为什么有的条目归不上）

entry id 的写法决定能否归到插件：

- `dsh-better-sidebar:editor` → 冒号前是插件名 ✅
- `@scope/pkg/guide` → 路径首段 ✅
- `turnstile.plugin-list` → 第一段 ≥6 字符且带点号 ✅
- `bash`、`user`、`permission` → 核心条目，**归不上是正常的**

## 相关

- `docs/130-runtime-records-shape.md`：`ctx.slots._core.records` 的真实结构（entry id 在 `options.id`，`declaredBy` 不是插件名）
- `tools/ui-atlas.mjs`：面 → 插件 → 声明矩阵（静态）
- `tools/inspect-plugin.mjs`：单个插件的实现骨架
