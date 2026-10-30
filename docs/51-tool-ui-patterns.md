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
