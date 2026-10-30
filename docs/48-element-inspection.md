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
