# 每插件 × 每 slot 的分布表（2026-11-01）

## 它回答的问题

「这个插件到底插了哪几个位置」——不是它声明的 `inject` 面（那是意图），而是**运行时的真实条目**。

```bash
node tools/slot-map-report.mjs --map state/slot-map-mini.json
node tools/slot-map-report.mjs --map … --plugin dsh-better-sidebar
node tools/slot-map-report.mjs --map … --json
```

## 真实数据（mini，105 个 slot）

```
dsh-better-sidebar  ·  15 条 · 4 个位置
      6  sidebar.right.pane.tab        dsh-better-sidebar:editor, :git, :subagent …
      6  sidebar.right.pane.tab.title  dsh-better-sidebar:editor, :git, :subagent …
      2  conversation.session.header.utilities  :bottom-toggle, :context-diagnostics
      1  shell.overlay                 :context-diagnostics
```

**这就是「15 个位置」的真相**：不是 15 个不同 slot，而是 **4 个 slot、15 条**——
同一份数据既插标题又插内容（`pane.tab` 与 `pane.tab.title`），看着像两个位置，其实成对出现。

全表最大的一行是 `(核心/未归属) 210 条 / 82 个位置`，那是 DSH 自己的条目（`bash`、`user`、`permission`）。

## 归属规则

| entry id 写法 | 例 | 归属 |
|---|---|---|
| 冒号 | `dsh-better-sidebar:editor` | 冒号前 |
| 路径 | `@scope/pkg/guide` | 首段 scope/name |
| 点号 | `turnstile.plugin-list` | 第一段（≥6 字符） |
| 单词 | `bash` / `user` / `permission` | **(核心/未归属)**，不硬塞给插件 |

## e2e：slot-map 的 POST 现在有覆盖了

之前只有手工 curl 验证。现在 `console-server.mjs` 真实落盘，e2e 三条断言：

```
PASS  slot-map POST returns 200 and writes
PASS  slot-map GET reads back what was posted
PASS  slot-map rejects a body without slots   400
```

`e2e-console-offline` 89/89。

## 给下载仓库的人：`slot-audit` 技能

`skills/slot-audit/SKILL.md` —— 让别人在自己的 DSH 上跑同一套采集与报表：

1. 打开一次自己的 DSH 页面（客户端会自动上报 slot 快照）
2. `node tools/slot-map-report.mjs --map <state>/slot-map-<profile>.json`
3. 读表：多 slot 各一条是正常；两个插件抢**同一个** slot 才可能冲突

技能里还写了「采集不到怎么办」的三种现象与处理，避免用户卡在第一步。

## 测试

- `tools/test-slot-map-report.mjs` 8 条（三种前缀归属、核心条目不归属、分组、过滤、人读版、缺文件报错）
- `e2e-console-offline` 89/89（新增 3 条 slot-map 路由断言）
