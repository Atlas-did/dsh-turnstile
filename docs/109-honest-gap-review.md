# 现状自查：README、mini 沙盒、机制落地（2026-10-31 夜）

> 用户三个质疑：①README 没写清楚、在迎合商店 ②下载的人只会只读用，不会拿 mini 做实验
> ③之前那些开源项目的机制没体现出来，功能太少。逐条给事实。

## 一、GitHub 是不是最新？

```
$ git rev-parse HEAD            → 48643c3
$ git rev-parse origin/main     → 48643c3
$ git rev-list --left-right --count origin/main...HEAD → 0  0
$ git status --porcelain | wc -l → 0
```

**dsh-turnstile 这个仓库是同步的**：381 个文件、91 篇文档、85 个工具、52 个插件文件、140 个测试。

**但有一半东西根本没上传**：`C:/Users/finef/Desktop/mini-harness` 是平台本体（三档 profile、启动器、
`home/`、`vendor/`、`docs/01-10`、截图、state 产物）。它的 git 根是 `C:/Users/finef`，**没有 remote、0 个跟踪文件**。
也就是说：**工具在 GitHub，跑工具的机器不在 GitHub**。别人 clone 下来没有 mini 可用——这正是「只会只读用」的物理原因。

## 二、机制落地到底有几成？（按代码审计，不按文档）

| 机制 | 来源 | 模块 | 状态 |
|---|---|---|---|
| 正交位域差异码 | WinMerge | `diff-state.js` 4KB | ✅ 接进 `index.js` + `console.html` |
| 虚拟列表 | TreeNew | `virtual-window.js` 2KB | ✅ 接进 |
| 能力约束（模型决定） | Designable | `capabilities.js` 2KB | ✅ 接进 |
| 多选 / 批量写 | LowCodeEngine Selector | `selection.js` 2KB | ✅ 接进 |
| Setter 注册表（声明出控件） | LowCodeEngine | `field-schema.js` 4KB | ✅ 接进 |
| 属性声明化 | Formily | `inspector-model.js` 4KB | ✅ 接进 |
| 事件钩子 before/after | amis | `hooks.js` 3KB + `hook-rules.js` 3KB | ✅ 接进 |
| 历史时间线（并行面板） | Designable | `history-timeline.js` 5KB | ✅ 接进 |
| 命令栈（保留快照策略） | wxFormBuilder | `designer-ops.js` 33KB | ✅ 接进 |

**结论**：九个机制都进了代码，不是只写在文档里。但——

**功能感觉少，原因不是没接，而是**：

1. 它们大多藏在**属性面板/设计器**里，README 一张图都没讲这些交互；
2. 没有一条「十分钟从上手到做实验」的路径，读者只会用 `preflight` 这种一条命令；
3. **mini 沙盒根本没进仓库**，别人无法复现「先在小环境试，再推主环境」这个核心工作流。

## 三、README 的问题（我自己挑）

| 现状 | 问题 |
|---|---|
| 328 行英文，标题是英文商店口吻（Quick start / Boundaries / Trust levels） | 面向「上架审核」而不是「一个想干活的 AI/人」 |
| 快速开始是 6 条并列命令，没有先后依赖 | 读者不知道「先哪条、失败怎么办」 |
| 「See the whole picture」只讲了 gate-map | 面板 40+ 个 testid 的交互一个都没写 |
| 没有 mini 章节 | 平台最核心的「隔离沙盒」能力缺席 |
| 没有「AI 该怎么用」 | 下载方（很可能是 agent）只看到只读命令 |

## 四、要补的三件事（按你说的顺序）

1. **README 重写**：中文为主，删掉商店话术，改成「三条路径」——
   ① 只读体检（最快）② 沙盒实验（mini）③ 深入机制（面板/设计器/钩子）。
2. **操作手册 `docs/manual/`**：逐屏讲面板（截图 + 每个按钮干什么 + 什么时候用），
   以及「AI 操作手册」：明确写出「该在 mini 里做的动作清单」和「什么情况下不要动主 profile」。
3. **把 mini 平台上传**：新建仓库（或同仓库 `platform/` 目录），含三档 profile 模板、启动脚本、
   `docs/01-10`，**不含** `node_modules/`、凭据、state 产物。

## 五、没做的（不装懂）

- 上面三件事这次只写了这份自查，尚未动工。
- 「功能少」如果需要真加功能，需要你指名：是面板交互、还是诊断深度、还是插件管理动作。
