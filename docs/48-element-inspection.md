# Element inspection: what the DOM can and cannot tell us

The panel now has a 检查 (inspect) mode: turn it on, click anywhere, and it reports what is under
the pointer. Measured results:

    center click -> <div.wSkVaW_scrollBody>（宿主未给该渲染节点打插件标记）
    whale area   -> <img>（宿主未给该渲染节点打插件标记）

## What works

- The click is captured before the page handles it, so inspecting never triggers the UI;
- The element's tag, first two classes and `data-testid` are reported;
- The result line stays visible in the panel until the next pick.

Useful for: "what is this thing under the cursor", layout debugging, and confirming our own
components (which do carry `data-testid`).

## What does not work: naming the owning plugin

The host **does** tag resources:

    data-plugin=dsh-meme
    data-plugin-css=dsh-soul-md/main.css

but those attributes sit on injected `<style>` / `<link>` elements, not on the DOM nodes that
plugins render. Probing every element found 12 such attributes, all on resources; the rendered
nodes carry none. So `closest('[data-plugin]')` from a visible element never matches.

Tried and rejected: React fiber walking (component names are internal), slot registry lookup
(entries are not annotated with their owner either).

## What would fix it (upstream, one attribute)

If the slot renderer wrapped each entry in a container carrying the declaring plugin:

    <div data-slot-entry="shell.overlay" data-plugin="dsh-whale-musume">

then element inspection would answer "which plugin owns this pixel" with one `closest()` - and the
same attribute would let the occupancy map show *where on screen* each plugin paints, not just
which surface it declares.

Until then the panel is honest about it: it prints the element and says the host did not mark it,
instead of guessing a plugin name from a heuristic.

## Why not guess

A wrong owner is worse than no owner: the user would file a bug against an innocent plugin, and
the drag/anchor flow would write a config row for the wrong package. "Unknown" is a valid answer.
## 更正（同日）：fiber 能给出 owner，比 data-plugin 可靠

上面「认不出插件」的结论被推翻了。改用 React fiber 之后，任意 DOM 节点都能回溯到它的
slot 边界：每个 slot 条目都渲染在 `RootEntry` 里，它的 props 带 `slotKey` 和 `entry.options.id`。

实测（mini，点击三处）：

    640,300  -> slot main
    200,300  -> slot sidebar.workspaces
    1100,200 -> slot shell.overlay · turnstile.plugin-list

这正是 Process Explorer 那个准星的同构实现：

| Process Explorer | 我们 |
|---|---|
| `WindowFromPoint` 取窗口句柄 | `document.elementFromPoint` 取 DOM 节点 |
| `GetWindowThreadProcessId` 取进程 | 沿 `__reactFiber$` 上溯到 `RootEntry` 取 `slotKey` + `entry id` |
| 显示进程名 | 显示 slot 名 + 条目 id |

差别：它拿到的是进程（唯一），我们拿到的是 slot 条目（同一插件可能有多个条目）。
但「这块像素由谁渲染」这个问题的答案，现在是精确的，不再是猜的。

对上游的需求也降级了：不再是「请给节点加 data-plugin」，而是「可选地给 RootEntry 加
一个 registrant 字段」——`registrant` 目前是压缩后的类名（`Gb`），拿不到插件名。
