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

## 明确不做的

- 换 harness 的适配层：本工具是 DSH 形状的，另一套宿主需要重写适配而不是加开关。
- 客户端直接写 profile：文件写入只能发生在 host 侧。
