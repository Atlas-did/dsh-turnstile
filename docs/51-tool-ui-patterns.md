# What professional system tools teach about this panel

Three references, studied for layout rather than looks: DiskGenius (partition utility), Everything
(instant search), Process Explorer (Sysinternals). All three are dense, fast, keyboard-friendly and
have looked the same for a decade - because the layout is doing the work.

## The shared skeleton

    +--------------------------------------------------------------+
    | toolbar: the 3-5 actions that matter, icon + text            |
    +---------------+----------------------------------------------+
    | navigation    | data table (sortable columns, filter box)    |
    | tree / tabs   |                                              |
    +---------------+----------------------------------------------+
    | property grid: label | value, two columns, aligned             |
    +--------------------------------------------------------------+
    | status bar: counts, selection, what was just done            |
    +--------------------------------------------------------------+

DiskGenius: left disk tree, right partition table, bottom a label/value property grid, status bar
with the disk model. Process Explorer: process tree in the middle, a **lower detail pane with tabs**
(Image / Performance / TCP-IP), filter box above the tree, colour only on risky rows. Everything: a
single filter box that filters as you type, a result table, a status bar with totals.

## The eight rules worth copying

| # | Rule | Why it matters for us |
|---|---|---|
| 1 | **Three zones, never one** - navigate, list, inspect | our old card stacked five sections; the eye had no anchor |
| 2 | **Dense rows, small type, no wasted padding** | 26 plugins must fit on one screen without scrolling |
| 3 | **Numbers right-aligned, monospace** | "硬编码 8" vs "8" - comparison is the whole point |
| 4 | **Colour only encodes state** | red = contested, amber = advisory, grey = neutral; never decoration |
| 5 | **Property grid, not a sentence** | label/value pairs align, so scanning down a column works |
| 6 | **Filter is a box at the top, filtering as you type** | "which plugin owns this " is answered in one keystroke |
| 7 | **Status bar counts what is not visible** | "26 items, 2 disabled, 1 skipped" - the summary is always on screen |
| 8 | **Actions live in a toolbar, and each has a keyboard path** | no hunting inside rows for the only button |

## Mapping to our settings page (M1)

    toolbar    [重新体检] [打开架构图] [导出报告]        filter: [________]
    left nav   概览 / 架构图 / 占用 / 插件 / 控制台
    table      名称 | 版本 | 状态 | UI 面 | 位置 | 行 id
    inspector  the selected row's properties, label/value
    status     26 个插件 · 停用 2 · 引擎跳过 1 · 11 处争用

The 架构图 page is the exception: it fills the whole content area (a diagram needs the space), with
the same toolbar and status bar around it.

## What we deliberately do not copy

- **Modal dialogs for property editing.** Inline edit with an explicit apply (and our dry-run rule
  from the CLI) beats a modal that hides context.
- **Icon-only toolbars.** DiskGenius can afford it after twenty years; we cannot.
- **Blue gradient chrome.** The host already owns the theme; a settings page must look native.

## Why this matters more than the diagram

A user opens this panel to answer one of four questions: is it healthy, who is fighting, can I move
it, what did it just do. Each needs a zone on screen at the same time - the list alone cannot
answer any of them. That is the whole reason for the three-zone skeleton.
## 附录：Process Explorer 的工具栏（逐项点名）

放大截图后能确认的 9 个按钮 + 3 个内嵌图表区，从左到右：

| # | 图标 | 功能 | 快捷键 |
|---|---|---|---|
| 1 | 软盘 | 保存当前列表到文件（TSV/CSV） | Ctrl+S |
| 2 | 蓝色循环箭头 | 刷新快照（再次采样） | F5 |
| 3 | 上下分栏的窗口 | 显示/隐藏下方面板（选中项详情） | Ctrl+L |
| 4 | 折线图窗口 | 打开系统信息（CPU/内存/IO 历史） | — |
| 5 | 两节点连接图 | 显示/隐藏进程树（父子缩进） | — |
| 6 | 蓝色 i + 齿轮 | 选中进程的属性/详情 | — |
| 7 | 红色 × | 结束进程（危险动作，红色是唯一的危险色） | Del |
| 8 | 放大镜 | 查找句柄或 DLL | Ctrl+F |
| 9 | 准星 | 拖动准星到窗口上，找出它属于哪个进程 | — |
| — | 绿色折线区 | CPU 使用率历史（内嵌实时图） | — |
| — | 黄绿实块 | 内存历史条 | — |
| — | 橙色实块 | I/O 历史条 | — |

第 5 个（两节点图）和第 6 个（i+齿轮）我按截图判断是「树开关」和「属性」，
分辨率到此为止，这两个**不保证**；其余 7 个确定。

## 它们是怎么连在一起的（这才是重点）

四个入口，一套命令：

    File / Options / View / Process / Find / Users / Help   ← 菜单：全集
    工具栏                                                  ← 高频子集，同一批命令
    右键菜单                                                ← 当前选中行的上下文动作
    快捷键                                                  ← 老手路径（F5 / Ctrl+F / Del）

三条状态规则：

1. **没有选中进程时，属性/结束这类按钮不可用** —— 动作是否可点由选择状态决定；
2. **刷新是「重采样」而不是「实时流」** —— 每次刷新产生一个新快照，跨快照比较；
3. **颜色编码的是「变化」，不是「现状」** —— 青色=新出现、红色=已结束、粉色=系统服务、
   紫色=被压缩(packed)、灰色=挂起。同一行在不同时刻颜色不同，因为它回答的是「刚刚发生了什么」。

第 3 条对我们最有启发：我们的面板现在只显示**当前状态**（26 个插件、11 处争用），
但没有告诉我们**和上次比变了什么**。这正是 promote 已经在算的东西，应该搬到面板首屏。

## 不进工具栏的东西

Process Explorer 菜单里有几十项（VirusTotal 检查、线程栈、挂起/恢复、亲和性……），
工具栏只放 9 个。**工具栏不是菜单的缩略图，而是「每十分钟会点一次」的那几个。**
