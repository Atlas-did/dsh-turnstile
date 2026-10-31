# 「看」进控制台 + 运行时列（2026-11-01）

## 1. 控制台新增「插件骨架」视图

`/turnstile/console` → 左侧「插件骨架」→ 输入包名 → 出骨架。

真机（mini，18770）实测：

```
插件        dsh-mimir @0.21.2
状态        已安装 · 在 bundles
inject 面   api-remotes, api-session-controller, locale, ui-layout, ui-renderer, ui-sidebar, ui-theme
patch 行    mimir
入口        lib/client.js
slot        sidebar.expand, sidebar.fold, sidebar.footer.action, shell.overlay
```

页面无 JS 错误（pageerror = 0），截图 `state/skeleton-live.png`。

数据来自新路由 **`GET /turnstile/inspect?pkg=`**，与 CLI 共用 `lib/plugin-inspect.js`（抽出的纯数据层）。

## 2. 运行时列（ui-atlas）

- 新路由 **`GET/POST /turnstile/slot-map`**：POST 把 `{slots:[{slot,count}]}` 存成 `state/slot-map-<profile>.json`。
- `tools/ui-atlas.mjs` 读它，CSV 增列 `runtimeCount`，HTML 增「运行时条目」列。

实测 POST：

```
$ curl -X POST -d '{"slots":[{"slot":"shell.overlay","count":2}]}' …/turnstile/slot-map?token=…
{"ok":true,"file":"…\\state\\slot-map-mini.json","slots":1}
```

atlas 读入后 `ui-settings` 行出现 `runtimeCount=9`（用夹具验证）。

**诚实标注**：这是「注入条目数」，**不是 DOM 节点数**；客户端采集那条链路（`client.js` 在 DSH 页面里 POST）
我只验证了「路由能收、atlas 能读」，**面板打开时真的 POST 一次没有端到端验证**。

## 3. 抓到并修掉的两个真 bug

### bug 1：`?token=` 把查询参数吃掉了（这条之前我还标了 unverified）

```js
fetch('/turnstile/inspect?pkg=' + encodeURIComponent(name) + tokenSuffix())
// tokenSuffix() 返回 '?token=...' → URL 变成 ?pkg=x?token=y → pkg 里带上了 token
```

结果：骨架页显示「dsh-mimir?token=…」→ 未安装；启动器搜「launcher」也永远搜不到。
修法：`tokenSuffix().replace('?','&')`。**修完后启动器 UI 第一次真正渲染出结果**（e2e 断言 800/600 两条）。

### bug 2：直接重绘时只 append 不 clear → 页面叠两份

`launcher()` / `skeleton()` 被异步回调直接调用时没走 `render()` 的 `replaceChildren()`，
所以一次搜索后出现两套「启动器」标题。修法：函数开头 `main.replaceChildren()`。

## 4. 我自己犯的一个大错（必须记下来）

我用 `tools.read` 读整个 `console.html`、`.map(l=>l.text).join('\n')` 写回，**把长度超过 2000 字符的行截断了**，
行尾被写成 `... (line truncated to 2000 chars)`，整段脚本语法直接坏掉（页面空白、`renderInspector is not defined`）。

- 表现：e2e 卡在 `waitForSelector('[data-testid="metric-architecture"]')` 超时。
- 恢复：`git checkout -- console.html`，然后用**小的 edit** 重放全部改动。
- 教训：**永远不要整文件 read→write 往返**；只读要改的那几段，用 edit。

## 5. 测试

`e2e-console-offline` **82/82** 通过，新增：

- 骨架视图显示 inject 面 / patch 行 / slot；
- 启动器结果真的渲染出 `launcher.mjs`（此前是 unverified）。
