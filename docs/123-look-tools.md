# 三个「看」的工具（补上研究 UI 插件缺的入口）

## 1. `tools/inspect-plugin.mjs` —— 一条命令看一个插件的骨架

```bash
node tools/inspect-plugin.mjs <profileDir> <pkg> [--lines 40] [--json]
```

### 真机实测：`dsh-mimir`（mini profile）

```
插件 dsh-mimir @0.21.2
  状态   已安装 · 在 bundles
  引擎   未声明   平台 web
  inject 7 个面：api-remotes, api-session-controller, locale, ui-layout, ui-renderer, ui-sidebar, ui-theme
  patch  cordis.patch.yml → 行 mimir
  入口   lib/client.js  (1,476,318 字节)
  slot   sidebar.expand, sidebar.fold, sidebar.footer.action, shell.overlay
  inject 调用 sidebar.footer.action, shell.overlay
```

**这就解释了之前那个「Mimir 按钮太小 / 远程控制太大」的问题**：
`dsh-mimir` 和 AA 桥都往 `sidebar.footer.action` 注入，两个插件抢同一个位置。

### 它给你什么

| 字段 | 来源 |
|---|---|
| 安装/停用状态 | profile 的 package.json + cordis.patch.yml |
| 引擎/平台/兼容性声明 | 插件 package.json 的 engines / dsh.client.platform / dsh.compatibility |
| inject 面 | dsh.client.inject |
| patch 行 | 插件自带 patch 文件里的 `- id:` |
| 客户端入口 | lib/client.js（或 dist/client.js / dsh.client.entry） |
| slot / 类名 / testid / inject 调用 | 对入口源码做正则扫描（不猜语义） |
| 源码头 N 行 | 直接打印 |

## 2. `tools/ui-atlas.mjs` —— 面 → 插件 → 注入条目矩阵

```bash
node tools/ui-atlas.mjs <profileDir> [--out x.html] [--csv x.csv] [--json]
```

mini profile 实测：**233 行 CSV**，面按插件数降序：

```
  26  patch-row
  10  @deepseek-ai/dsh-client-locale
   8  ui-conversation
   7  ui-settings
   4  ui-renderer
   3  api-remotes / connection / ui-slots
```

HTML 是一页表（面 / 插件数 ≥5 标黄 / 谁在里面 + patch 行 id），可直接贴给作者。

## 3. `tools/diff-plugins.mjs` —— 两个插件差在哪

```bash
node tools/diff-plugins.mjs <profileDir> <pkgA> <pkgB> [--json]
```

实测 `dsh-mimir` ↔ `dsh-better-sidebar`：

```
注入面
  共有 locale
  仅 dsh-mimir api-remotes, api-session-controller, ui-layout, ui-renderer, ui-sidebar, ui-theme
  仅 dsh-better-sidebar ui-slots, ui-conversation, ui-sidebar-right, modules
patch 行  仅 dsh-mimir mimir   仅 dsh-better-sidebar better-sidebar
体积  dsh-mimir 1452KB   dsh-better-sidebar 1530KB
```

**一眼看出**：mimir 是「往渲染层和侧栏里插」，better-sidebar 是「改结构（ui-slots / ui-sidebar-right）」。

## 4. 测试

`tools/test-look-tools.mjs` —— **18 条**，用假 profile 造两个插件，验证：
版本/安装态、inject 面、patch 行、停用状态、slot 键、类名、源码头、未安装报错、
atlas 的 HTML/CSV/面对应、diff 的三类差异与错误路径。

**过程中修的两处**：
1. 类名扫描只认 `className: "x"`，漏了 `className="x"` / `class="x"` —— 已扩成正则两种写法都吃；
2. 测试自己的夹具用了 `var cls="my-btn"`（根本没写 className），先怪工具后看夹具，是我的错。

## 5. 还没做

- `inspect-plugin` 不做依赖解析（不展开插件 import 了谁）；
- `ui-atlas` 的「注入条目」只有 patch 行，没有渲染出来的真实节点（要跑宿主才行）；
- 三者都还没进控制台（目前只有 CLI）。
