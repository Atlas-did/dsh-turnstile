# wxFormBuilder and Pygubu Designer: now studied from the real UI

Earlier I put both of these in the "studied" table while only having seen a GitHub page and a video
title. That was wrong. This time both were installed and captured off-screen, so the notes below come
from the actual interfaces.

## How they were obtained

| Tool | Source | How it ran |
|---|---|---|
| wxFormBuilder 4.2.1 | GitHub release `wxFormBuilder-4.2.1-ucrt-x86_64.zip` (portable folder) | launched, window captured with `tools/capture-window.ps1` |
| Pygubu Designer | `pip install pygubu-designer` (MIT, Tkinter GUI designer) | launched; its Tk window belongs to `python.exe`, so it was captured by window handle |

Both were closed afterwards - nothing left running on the desktop.

## wxFormBuilder 4.2.1 - what the window actually shows

    File Edit Components View Tools Help
    [new][open][save] | [undo][redo] | [cut][copy][paste][del] | [alignment tools]
    +----------------+-------------------------------------+------------------+
    | Object Tree    | Component Palette                   | Object           |
    | MyProject1     | Common Additional Data Containers    | Properties       |
    |   : Project    | Menu/Toolbar Layout Forms Ribbon    |   Properties     |
    +----------------+-------------------------------------+     Events       |
    |                | Editor: Designer C++ Python Lua     |                  |
    |                |         PHP XRC                     |                  |
    +----------------+-------------------------------------+------------------+
    status bar: Name: MyProject1 | Class: Project

Four things worth taking:

1. **The editor tabs ARE the generators.** `Designer | C++ | Python | Lua | PHP | XRC` - the same
   project is rendered as a canvas and as five code targets. The canvas is a view, not the product.
2. **The property grid is grouped and collapsible**, and its groups are *language-specific*:
   `Project` (name, code_generation, path, encoding, first_id), then `C++ Properties`
   (cpp_namespace, cpp_class_decorator...), then `Python Properties` (python_indent_width,
   python_skip_event...). One object, several property sets, chosen by target.
3. **Properties and Events are separate tabs.** You never confuse "this widget's value" with
   "what happens when you click it".
4. **The palette is categorised** (Common / Additional / Data / Containers / Menu-Toolbar / Layout /
   Forms / Ribbon), not one long list.

## Pygubu Designer - what its window shows

    File Edit Project Preview Help
    [New] [Open] [Save] | [Build code]
    +---------------------------+ +--------------------+
    | Components Palette        | | Project Tree       |
    | Filter: [____]  [tk]      | | Filter: [____]     |
    |  Containers               | |  ID                |
    |  Control & Display        | |                    |
    +---------------------------+ +--------------------+

Three things worth taking:

1. **`Build code` is a toolbar button**, not a menu item - generating the artefact is the main loop,
   not an afterthought.
2. **A filter box on each pane**, not one global search: the palette and the tree are filtered
   independently because they answer different questions.
3. **`Preview` menu** - you can run the UI without leaving the designer.

## What we adopt, and where

| Teaching | Where it lands | Status |
|---|---|---|
| Editor tabs = generators (canvas is a view) | settings page: 插件页旁边加一个 `patch 预览` 视图，显示这一行会写成什么 | planned |
| Grouped, target-specific property sets | inspector groups: 值 / 行为 / 位置，而不是一条平铺列表 | planned |
| Properties vs Events as separate tabs | 行详情分「属性」「动作」两栏 | planned |
| Build/preview as primary actions | 设置页顶部按钮：重新体检 / 预览改动 / 打开架构图 | partial (体检、架构图已有) |
| Per-pane filter | 每个列表自带筛选（插件页、占用页已有） | done |
| Categorised palette | 插件市场式分类浏览 | not started |

## The one thing neither tool does, which we do

Both generate code and stop. Neither **applies** it to a live environment and verifies the result.
Our loop continues: write -> restart -> screenshot -> confirm. That is the part worth keeping, and it
is why the settings page shows a `自上次查看` diff rather than just a code pane.
