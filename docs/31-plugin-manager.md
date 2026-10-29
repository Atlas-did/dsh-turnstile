# 31 · mini 的插件管理界面：现状与两条路

目标第 5 项要求「新会话/启动时弹窗列出已装插件，可直接开关并写回 cordis.patch.yml」。
下面是把这件事拆开后的实际状态，不含推测。

## 已经完成的部分（数据层 + 两种前端）

```bash
node tools/manage.mjs <profile>                     # 一次性列出：状态 / 行 id / 引擎跳过
node tools/manage.mjs <profile> --menu              # 交互模式：t <n> 切换, s 保存, q 退出
node tools/manage.mjs <profile> --disable <pkg> --yes
node tools/manage.mjs <profile> --enable  <pkg> --yes
```

数据模型（弹窗将来直接用同一份）：

```
bundles(managed)  → 每个插件：row ids、是否停用、是否引擎跳过、是否未安装
行 id 来源        → 插件自己的 cordis.patch.yml 里 (id, name) 配对，不猜包名
写入方式          → 追加/删除 `- id: X` + `disabled: true`，写前自动备份
```

已实测（全部有输出佐证）：

- dry-run 不写文件：`DRY RUN — 会写 ...`
- 写入后 **YAML 合法**（js-yaml 解析回 `[{id: toggle-row, disabled: true}]`）
- 空 patch 的 `[]` 哨兵会被正确替换，不会写出非法 YAML
- menu 模式：`t 1` 切换、`s` 保存、`q` 退出；只切换不保存**不落盘**
- 版本未知时不谎报跳过：打印 WARNING，引擎跳过计数为 0

selftest 覆盖 11 个夹具用例，其中两个专门盯这条路径。

## 还没做的部分：真正的「弹窗」

「弹窗」需要 DSH **客户端插件**（bundle + client entry），而不是 CLI。目前没有做，原因是：

1. 本仓库至今只有 node 侧脚本，没有任何 client bundle 经验；
2. DSH 的客户端注入契约（ui-slots / ui-conversation 提供什么插槽、组件如何注册）需要先摸清；
3. 客户端插件一旦出错，影响的是**整个界面**，比 CLI 风险高一个量级。

### 需要先回答的三个问题

| 问题 | 怎么查 |
|---|---|
| 有没有「浮层/对话框」插槽，还是只能往某个面板里塞组件 | 读 `@deepseek-ai/dsh-client-ui-*` 的导出与注入点 |
| 客户端插件如何拿到宿主数据（插件列表、停用状态） | 看现有客户端插件怎么请求 host 侧服务 |
| 开关操作是否允许客户端直接改 profile 文件 | 大概率要走 host 侧 RPC，不能由浏览器端写盘 |

### 建议的落地顺序

1. 先做一个**只读**的客户端面板（列出插件 + 状态），验证注入契约 —— 不改任何文件；
2. 再加「跳转到 gate-map 报告」的链接；
3. 最后才加开关（写操作必须经 host 侧，且复用 `manage.mjs` 的同一套纯函数 `toggleInPatch`）。


## 客户端契约：已经查到（2026-10-30）

证据来自已安装的 `dsh-voice` 客户端 bundle（`lib/update-client.js`）：

```js
// 第 415-416 行：注册到浮层插槽，这正是「弹窗」需要的入口
ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: '...', order: 1000 }, NativeFooter));
ctx.slots.inject('shell.overlay',       () => ctx.slots.register({ name: 'shell.overlay', id: '...' }, Reminder));
```

结论：

| 之前的问题 | 答案 |
|---|---|
| 有没有浮层插槽 | **有**：`shell.overlay`（浮层）、`plugins.detail.section`（插件详情区） |
| 客户端插件怎么注册 | `ctx.slots.inject(slotName, () => ctx.slots.register({name, id, order?}, Component))` |
| 组件怎么写 | 直接 `React.createElement`，无构建步骤；宿主提供 React 全局 |
| 入口格式 | `window.__ModuleLoader__.load(__wrap({id, factory}, {name, version, hasWorkbench}))`（打包器生成） |

所以「弹窗」在技术上可行，形状是：一个 client bundle → `apply(ctx)` 里 `ctx.slots.inject('shell.overlay', ...)` → 渲染我们的插件清单。

### 还剩的风险

1. `__ModuleLoader__.load` 的包装格式是打包器生成的，手写要贴得很准；
2. 弹窗读数据需要宿主侧接口（客户端拿不到文件系统）；写开关必须走 host；
3. 客户端错误会砸整个界面 —— 必须先在 mini 上试，且能一键卸载。

### 下一步（下一步才做）

1. 复制 `dsh-voice/lib/update-client.js` 的包装结构，做一个**只读**最小 bundle（列出插件名 + 状态）；
2. 在 mini 安装 → 重启 → 看 `shell.overlay` 是否出现（无 UI 也能从日志/截图判断）；
3. 只读验证通过后，再考虑把 `manage.mjs` 的 `toggleInPatch` 通过 host RPC 接上。


## 第一次弹窗尝试：失败，已回滚（2026-10-30 00:10）

按上面的契约写了最小只读 bundle（`research/turnstile-popup/`，22 条快照），装进 mini 后：

```
HARNESS
Failed to load plugins
turnstile-popup
web boot: 1 entry did not activate
turnstile-popup: failed
```

整页变成错误状态（桌宠还在渲染，说明宿主本身没崩，是**这一个 client 入口激活失败**）。
quicktest 从 10/10 掉到 `new-conversation errors=4`。已回滚：`pnpm remove turnstile-popup`、
从 bundles 里删掉，重启后 quicktest 恢复 **10/10**。

### 目前知道的

- 客户端入口失败会让**整个界面**报 failed —— 这是真实风险，不是理论风险；
- 我在 bundle 里写的是朴素形式：

```js
window.__ModuleLoader__.load({ id: 'turnstile-popup', factory: (require) => ({ apply(ctx) { ... } }) });
```

  而 dsh-voice 实际用的是 **包装器**：`__stardustUpdatesWrap({ id, factory }, participant)`，
  它返回 `{ ...definition, factory(require) { ...原 factory 结果 + apply 包装... } }`（第 224-230 行）。

- 也就是说：`factory` 的返回对象、`apply` 的签名、以及 registration 的 id 规则，
  都还没对齐；**猜一次就等于把界面弄挂一次**。

### 下一次的正确做法

1. **照抄一个能用的现成 bundle**（`dsh-voice/lib/update-client.js` 或 runtime 里 `dsh-api-job-controller/lib/client.js`），
   只把内部组件换掉，先不改包装结构；
2. 在 mini 上验证顺序：先确认 `apply` 被调用（打日志），再确认 `ctx.slots` 存在，最后才注册组件；
3. 每次失败都必须能**一条命令回滚**（删 bundle + pnpm remove + 重启），本次已演练过。

### 结论（写进目标状态）

弹窗这件事现在是「**契约已知、第一次实现失败、可安全回滚**」。剩下的是对齐包装层，
而不是设计问题。CLI 与数据层已完全可用，界面层是增量。


## 第二次尝试：成功（2026-10-30 00:25）

关键差异只有一处：client 模块必须**导出 `inject`（服务名，不是包名）**。

```js
window.__ModuleLoader__.load({
  id: "turnstile-popup",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.inject = ["slots"];              // ← 第一次失败就是因为缺这行
    exports.apply = function apply(ctx) {
      var React = require("react");
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "turnstile.plugin-list" }, Card));
    };
    return module.exports;
  },
});
```

实测结果（mini，截图 `state/popup-v3.png`）：

```
mini · 插件 24
停用 2 · 引擎跳过 1 · 只读
· dsh-better-sidebar
× dsh-context
· dsh-talk                    skip
...
```

同时：`quicktest` **10/10 全 PASS**，界面正常，无 failed 条目。

### 这一版学到的三条

1. **`inject` 是服务名**（`slots` / `sessions` / `locale` …），不是包名；缺了它 `ctx.slots` 就是 undefined，整个 client 入口激活失败；
2. **`factory` 要返回 `module.exports`**，`apply` 挂在其上（照抄 `dsh-api-job-controller/lib/client.js` 的形状）；
3. 数据不要在客户端解析文本：`manage.mjs --json` 出结构化数据，`build-popup.mjs` 直接吃 JSON。第一次我用正则解析对齐表格，`dsh-talk` 的 `on ENGINE-SKIP` 被解析成了插件名 `ENGINE-SKIP`。

### 仍然是只读

弹窗现在只能看。要能开关还需要：客户端 → host 的 RPC（客户端拿不到文件系统），
host 侧复用已测过的 `toggleInPatch()`。这是下一步，且必须走 host。


## 第三版：可交互（2026-10-30 00:32）

弹窗现在**从 host 路由取实时数据**，点一行就切换，并写回 `cordis.patch.yml`。

### Host 侧（`lib/index.js`）

```
GET  /turnstile/plugins   -> { profile, rows:[{name, disabled, row, installed}] }
POST /turnstile/toggle    -> body {package, disable} -> 写 patch + 备份
```

复用与 `manage.mjs` 相同的规则：行 id 从插件自己的 bundle patch 读，写前 `copyFileSync` 备份，
空 `[]` 哨兵替换，保证 YAML 合法。

### 已验证

| 项 | 证据 |
|---|---|
| GET 返回实时数据 | `curl .../turnstile/plugins` → 24 行，`dsh-context`/`dsh-token-diet` 标停用 |
| POST 停用 | `{"ok":true,"package":"dsh-talk","row":"talk","disabled":true}` → patch 出现 `- id: talk` |
| POST 启用 | 同样调用 disable:false → `grep id: talk` 归零 |
| 写后 YAML 合法 | js-yaml 解析出 5 个条目 |
| 备份 | patch 同目录生成 `.bak-<时间戳>` |
| 界面渲染 | 截图 `state/popup-final2.png`：停用 2 · 引擎跳过 1 · 点一行切换 |
| mini 健康 | quicktest **10/10** |

### 还没验证的一步

**在无头浏览器里点行**：playwright 定位到该行但点击超时（弹窗内部可滚动，元素被遮挡）。
路由本身已经 curl 验证过，所以缺的只是「UI 点击 → 请求」这一段的人机确认。
真实窗口里点一下即可闭环。

### 一个值得记住的坑

构建器一开始用 `tpl.replace("__TURNSTILE_DATA__", ...)` 注入数据，结果替换到了**注释里第一次出现的位置**，
代码里的占位符还在 → `ReferenceError` → 整个 client 入口激活失败、整页 failed。
改成唯一标记 `/*__TURNSTILE_DATA__*/null` 之后恢复。**注入点必须是代码里的唯一标记，不能是注释里也出现的词。**


## 第四版：完整闭环（2026-10-30 00:40）

现在弹窗同时显示三样东西（目标要求的全部）：

```
mini · 插件 24
停用 2 · 引擎跳过 1 · 挤爆的 UI 面 4 · 点一行切换
· dsh-better-sidebar     ui3
× dsh-context            ui3
· dsh-genui              ui4
× dsh-token-diet         ui1
· dsh-talk               ui1 skip
· dsh-univer-office      ui6
```

- **停用状态**：来自 profile patch 的行块解析
- **UI 抢占**：来自 `dsh.client.inject` + 插件自己的 patch 行，`uiN` 是注入面数，「挤爆的 UI 面」是 ≥3 个插件的面数
- **引擎跳过**：来自构建时快照（host 路由不判断版本，客户端按名字合并）

### UI 点击 → 写回，已端到端验证

用 playwright 在无头浏览器里派发点击（`target.click()`）：

```
candidates: [... {"t":"·dsh-ultramath","cursor":"pointer","kids":2}]
dispatch: clicked
patch changed: true | has ultramath row: true
```

随后用 `manage --enable dsh-ultramath --yes` 恢复，`grep id: ultramath` → 0，
js-yaml 解析 patch 仍是 5 个条目，**quicktest 10/10**。

### 目标第 5 项的验收对照

| 要求 | 证据 |
|---|---|
| 弹窗列出已装插件 | 截图 `state/popup-ui.png`，24 条 |
| 含停用状态 | `× dsh-context` / `× dsh-token-diet` |
| 含 UI 抢占 | `uiN` 徽标 + 「挤爆的 UI 面 4」 |
| 含引擎跳过 | `dsh-talk ... skip` |
| 可直接开关 | playwright 派发点击 → patch 出现 `- id: ultramath` |
| 写回 `cordis.patch.yml` | 文件确实变化，YAML 合法，有 `.bak` 备份 |

## 明确不做的

- 换 harness 的适配层：本工具是 DSH 形状的，另一套宿主需要重写适配而不是加开关。
- 客户端直接写 profile：文件写入只能发生在 host 侧。