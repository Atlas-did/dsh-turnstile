# 你机器上的 UI 插件实况 + mini 工作台好不好用

> 数据来源：`node tools/ui-surfaces.mjs <profile>`（跑的是真实 profile，不是猜的）

## 一、最常见的 UI 插件（按「触及几个 UI 面」排）

### 主 profile（desktop，36 bundles，18 个插件有 UI 注入）

| 触达面数 | 插件 | 类型判断 |
|---|---|---|
| 6 | `@nanmicoder/dsh-agent-teams` | 多点注入（会话/布局/侧栏/基础件）——重集成 |
| 5 | `dsh-univer-office` | 宽面覆盖（设置/渲染/会话/聊天） |
| 4 | `dsh-genui` | 会话 + 渲染 + 插槽 + 基础件 |
| 4 | `dsh-mimir` | 渲染 + 布局 + 侧栏 |
| 3 | `dsh-better-sidebar` | 侧栏改造 |
| 3 | `dsh-free-search` | 渲染层注入 |
| 2 | `@changfenhuang/dsh-annotation` / `dsh-context` / `@linxin666/dsh-ssh` / `dsh-ops` / `@agents-anywhere/dsh-bridge-next` / `@michengai/dsh-agency-agents` | 轻量按钮类 |

最挤的两个面：

```
@deepseek-ai/dsh-client-ui-settings      10 个插件
@deepseek-ai/dsh-client-ui-conversation   8 个插件
@deepseek-ai/dsh-client-ui-renderer       5 个插件
```

### mini profile（28 bundles）

```
ui-conversation 8   ui-settings 7   ui-renderer 4   ui-slots 3
```

**这说明什么**：`ui-settings` / `ui-conversation` 是所有人抢的位置；
想研究「插件怎么改界面」，从这两个面入手最有效——它们的插件最多、冲突最真实。

## 二、grading：mini 工作台用来「研究 UI 插件」好不好用

| 你想做的事 | mini 现在 | 便利度 |
|---|---|---|
| 看装了哪些插件、版本、行 id | ✅ 控制台「插件」/ `ui-surfaces` | 好 |
| 看谁占了哪个 UI 面、几个插件 | ✅ 「UI 占用」 | 好 |
| 判断某插件能不能拖动（有没有位置配置） | ✅ 能力约束（`capabilities.js`） | 好 |
| 试装一个新插件、坏了回滚 | ✅ `sandbox-trial` / 快照 | 好 |
| 装完能不能起、门禁过不过 | ✅ preflight / profile-yaml | 好 |
| **看插件源码怎么写的**（inject 了什么、用了哪个 slot、CSS 怎么盖） | ⚠️ 只有静态扫描器内部读源码，**没有给你看的入口** | 差 |
| **对比两个插件**（同面、同配置项差异） | ❌ 没有 | 很差 |
| **看到装上之后长什么样**（截图/元素树） | ❌ 面板只给统计，没有 UI 预览 | 很差 |
| **按 UI 面反查**：这个面上都有谁、各自按钮在哪 | ⚠️ 有人数，没有位置 | 中 |

## 三、结论

**mini 适合「装、验、回滚、看冲突」，不适合「读源码、看效果、做对比」。**

也就是说：**研究一个 UI 插件的「风险面」很方便，研究它的「实现」很不方便。**

## 四、补三个小工具就能补上（按性价比）

| 工具 | 干什么 | 成本 |
|---|---|---|
| `tools/inspect-plugin.mjs <profile> <pkg>` | 一页看全：package.json 的 dsh 声明、inject 列表、patch 行、client 入口文件、用到哪些 slot/类名、源码前 40 行 | 小（`plugin-sources.mjs` 已在读源码，只差一个入口） |
| `tools/ui-atlas.mjs <profile>` | 「面 → 插件 → 它们注入的条目」矩阵，导出 HTML/CSV | 中（occupancy + slot 树已有数据） |
| `tools/diff-plugins.mjs <profile> <a> <b>` | 两个插件在声明/注入面/配置项上的差异 | 中 |

## 五、现实建议

先做 **`inspect-plugin`**：它把「读源码」这件事从「翻 node_modules」变成「一条命令出一页」。
这是研究 UI 插件最短的路——你现在唯一真正缺的就是「看」的入口。
