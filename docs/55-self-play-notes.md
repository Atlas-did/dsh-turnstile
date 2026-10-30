# Self-play session, 2026-10-30 22:40

I opened the mini UI headless and used the panel the way a user would, instead of only asserting
selectors. Screenshot: `state/play-panel.png`. Findings are listed worst-first.

## What broke (real, seen on screen)

1. **The panel is clipped at the bottom.** The 插件列表 and slot 树 headers are visible, their rows are
   not - the panel is 470px tall in a window that leaves ~560px above the composer, and the sections
   scroll inside a box that is itself cut off at the viewport edge.
2. **The panel overlaps the conversation** at 1280x860. It is anchored `top:64px; right:16px` with a
   fixed width, so on a small window it sits over the message area.
3. **The topology edges are unreadable.** Eight plugins to seven surfaces gives 20+ crossing lines in
   a 300px-wide box; the red ones (contested) are indistinguishable from each other.
4. **The crosshair says `slot main` for most of the page.** Correct but useless: the conversation body
   is one slot, and the interesting entry ids live deeper.

## What worked

- Crosshair resolution: `1000,120 -> slot shell.overlay · turnstile.plugin-list`, repeatable.
- Panel drag position persists across reloads.
- Sections collapse/expand without re-fetching.

## What this changes

The module plan (docs/50) says the panel should become a settings page. This session adds two
concrete reasons: the floating panel **cannot fit dense content** (1) and **steals the conversation**
on small windows (2). A settings page has neither problem.

The topology box should stop trying to draw all edges (3). Options: draw only contested surfaces,
or move the graph to its own page (M2) and leave a summary in the panel.

For (4): report the deepest slot entry found, not the first `RootEntry` - walk until the next
`RootEntry` would be a different slot, and keep the last entry id that exists.

## Order I will work in

1. Filter box + counts (cheap, helps every other fix: you can filter to one plugin while debugging).
2. Move the graph out of the panel; the panel keeps a summary line (fixes 1 and 3 together).
3. Inline property grid for the selected row (fixes the "detail is a sentence" complaint).
4. Crosshair: deepest entry + hover highlight.
