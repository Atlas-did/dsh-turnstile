# 机制清单：从哪些项目里抽了什么（供你继续加）

> 你之前发给我的每个项目，抽走了哪个机制、落在哪个文件、现在到什么程度。
> 「已接」= 代码里被引用且 e2e 覆盖；「仅文档」= 写了设计没写实现。

## 一、已经抽走的（9 个机制）

| # | 项目 | 抽走的机制 | 落点 | 状态 | 它解决的问题 |
|---|---|---|---|---|---|
| 1 | **WinMerge** | 正交位域差异码（一个整数编码「你改了什么」） | `lib/diff-state.js` | 已接 | 两次采样之间，哪一行变了、是新增/删除/改配置 |
| 2 | **TreeNew** | 虚拟列表（只创建可见行） | `lib/virtual-window.js` | 已接 + 200 节点 fixture | 1200+ 架构节点不卡 |
| 3 | **wxFormBuilder** | 命令栈 + 「保留快照」策略 | `lib/designer-ops.js`（33KB） | 已接 | 设计器可撤销，但快照保留可回看 |
| 4 | **Designable** | 能力约束：模型说自己能做什么，UI 只问 | `lib/capabilities.js` | 已接 | 插件没声明位置配置时，不画拖拽手柄 |
| 5 | **Designable** | 历史时间线（与 undo/redo **并行**，不替换） | `lib/history-timeline.js` | 已接 | 看「什么时候变的」，而不是只回退一步 |
| 6 | **LowCodeEngine** | Selector 多选 + 批量写 | `lib/selection.js` | 已接 | 一次改 20 个插件的位置 |
| 7 | **LowCodeEngine** | Setter 注册表（声明 → 自动出控件） | `lib/field-schema.js` | 已接 | 新增字段不用改 UI 代码 |
| 8 | **Formily** | 属性声明化（schema 描述字段与校验） | `lib/inspector-model.js` | 已接 | 属性面板从数据长出来，不是手画 |
| 9 | **amis** | 事件钩子 before/after（before 可拒绝且要说明理由） | `lib/hooks.js` + `hook-rules.js` | 已接 | 改动前可被拦截，拒绝必须给原因 |

## 二、看过但只取了「思路」的

| 项目 | 看过什么 | 取走的 | 没取（原因） |
|---|---|---|---|
| **GrapesJS** | 命令/导航抽象 | 「导航命令」的概念进了设计器操作分层 | 不嵌入它的画布 |
| **ToolJet** | 查询/数据源编排 | 只读 | AGPL，只读不抄 |
| **Budibase** | 内部 DB + 绑定 | 只读 | BSL，只读不抄 |
| **anywhere-labs/dsh-desktop** | profile 代际、36px frame、最近可用 profile | 「最近可用」已进环境管家 | 不做它的窗口嵌入 |
| **dsh-market/dsh-market** | 安装/更新/校验流水线 | 安装前现状检查的思路 | 不抄它的 441KB 路由 |

## 三、可以继续加的（你挑）

### A 面板交互（最直观）

| 候选 | 来源 | 代价 | 价值 |
|---|---|---|---|
| 键盘全流程（j/k 选、空格切、Enter 打开、Esc 收） | LowCodeEngine | 小 | 高频操作不用鼠标 |
| 面板内「对比上次」视图 | WinMerge | 中 | 装完插件后一眼看哪里变了（`diff-state` 已有数据） |
| 批量写预览的并排 diff | WinMerge | 中 | 20 个插件一起改之前先看全貌 |
| 面板内时间线 scrubber | Designable | 中 | 拖动看历史快照 |
| 导出当前视图为 CSV/PNG | — | 小 | 贴到 issue 里当证据 |

### B 诊断深度

| 候选 | 来源 | 代价 | 价值 |
|---|---|---|---|
| 「为什么这个插件没生效」三段式（声明/引擎/运行时） | 本仓库 runtime-diff | 中 | 现在要跑三个工具 |
| 代理链路自动判定（NO_PROXY 生效性已有） | 今天的事故 | 小 | 扩展成通用「出站是否被拦」 |
| 版本漂移矩阵（宿主/插件/第三方 CLI） | dsh-market | 中 | codex 那次就缺这条 |

### C 插件管理动作

| 候选 | 来源 | 代价 | 价值 |
|---|---|---|---|
| 一键装/卸/回滚（带事务 + 健康检查） | `lib/txn.js` 已有 | 中 | 现在只能看不能动 |
| 「装前预演」：显示将要新增/改写的 4 个位置 | setup 的教训 | 小 | 防止再出现 B13 |

### D 沙盒工作流

| 候选 | 来源 | 代价 | 价值 |
|---|---|---|---|
| `sandbox promote`：mini 验证通过 → 生成主 profile 的变更清单 | — | 中 | 把「先试后推」做成命令 |
| `sandbox diff`：两个 profile 的插件与 patch 差异 | WinMerge 思路 | 小 | 一眼看 mini 和主环境差什么 |

## 四、这次已经能用的：沙盒自建

```bash
node tools/new-sandbox.mjs --root <dir> --profiles mini --port 18770 --dsh-bin <bin.js>
```

产出独立 `DSH_HOME`、profile、启动器、state/logs；`bundles` 预置 `dsh-base` + `dsh-web-app`（否则宿主静默退出）。
已实测：日志出现 `dsh web: http://127.0.0.1:18901/?token=…`，`/` 返回 401。
