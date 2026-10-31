# `ctx.slots._core.records` 的真实结构（2026-11-01 实测）

> 上一版 `runtimeCount` 恒为 0，理由是「不知道 records 长什么样」。现在知道了。

## 结构

```
records : Map<slotName, node>
node    : { spec, declaredBy, parent, declarationEpoch, entries, version, listeners, declarationListeners }
entries : Array<{ component?, options: { id?, key?, priority? }, locale?, registrant }>
```

实测（mini，18770，真页面）105 个 slot：

| slot | count | entry id 样例 |
|---|---|---|
| `tool.call.toolview` | 54 | `bash` / `read` / `read_image` |
| `conversation.chat.node` | 20 | `assistant-step` / `tool-call` / `user` |
| `sidebar.right.pane.tab` | 15 | `@deepseek-ai/dsh-client-ui-sidebar-right/guide` / `dsh-better-sidebar:editor` |
| `shell.overlay` | 14 | `turnstile.plugin-list` / `session-log-upload-toast` |
| `settings.general.item` | 12 | `permission` / `language` |

## 三个坑（之前就是这么错的）

1. **entry 的 id 不在 `e.id`，在 `e.options.id` / `e.options.key`** —— 原来取 `e.id||e.key` 全是 `"?"`。
2. **`node.declaredBy` 不是插件名**，是「这个 slot 自己被谁声明」的字符串：
   `an entry in "conversation.chat.node" (Gb)`。拿它对齐插件是错的。
3. **`entry.registrant` 是压缩后的类名**（`"Gb"`），也拿不到插件名。

## 那怎么算到插件头上

**看 entry id 的前缀**（实测三种写法都能对上）：

| 写法 | 例 | 归属规则 |
|---|---|---|
| 冒号 | `dsh-better-sidebar:editor` | `startsWith(plugin + ':')` |
| 路径 | `@deepseek-ai/dsh-client-ui-sidebar-right/guide` | `startsWith(plugin + '/')` |
| 点号 | `turnstile.plugin-list` | 插件名第一段 ≥6 字符且 `startsWith(head + '.')` |

**拿不到归属的**（`bash`、`user`、`permission` 这类核心条目）**不计给任何插件**——宁可空着，也不凑数。

## 实测结果

```
dsh-better-sidebar  pluginRuntime=15
turnstile-popup     pluginRuntime=1     （turnstile.plugin-list）
ui-settings         runtimeCount=2      （夹具形状）
```

## 顺带修掉的两个真问题

1. **`mini-ctl` 的两处日志 bug**：
   - 子进程 stdout/stderr 被 `stdio:'ignore'` 丢掉 → 新 token 谁也看不到，`/` 一直 401；
   - `url()` 取日志里**第一条** token（旧进程的）→ 明明进程还活着却打不开。
   现在：日志 append 写、token 取最后一条。实测 `root=303`（正常跳转）。

2. **`/turnstile/inspect` 的 e2e 不再用硬编码夹具**：
   `console-server.mjs` 改成调用真的 `inspectPlugin` 打 fixture profile，
   e2e 三条断言（200 带字段 / 穿越 400 / 未装 200+installed=false）。

## 仍未做

- 只做了「条目数」归属，**没有做每插件在哪个 slot 的分布表**（数据已有，只是没展示）；
- `tool.call.toolview` 那 54 条是核心工具视图，不是插件，属正常。
