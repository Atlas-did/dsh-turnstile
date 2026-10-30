# Virtual list: only the visible rows exist (from TreeNew)

Fifth mechanism read from System Informer. Read: `phlib/treenew.c`, **332 KB**, via the contents API
(the raw host returned a 487-byte error page, so the base64 payload was decoded instead of trusting an
empty body).

## What the source establishes

| Evidence | Meaning |
|---|---|
| `Context->VScrollPosition` | the control tracks a scroll offset, it does not build widgets for every row |
| `PhTnpGetRowRects(Context, Start, End, ...)` | geometry is computed **for a range**, not for the list |
| `PhpTnpInvalidateRect(Context, &rowRect)` after intersecting with the content rect | repaint only what intersected the viewport |
| a `GetChildren`-style API (`Node`, `Children`, `NumberOfChildren`) | the model is a tree the control queries lazily, not a pre-flattened array |

## What was shipped

`lib/virtual-window.js` - pure functions, no DOM:

```js
computeWindow({ total, scrollTop, rowHeight, viewportHeight, overscan })
  -> { start, end, topPad, bottomPad, clamped }
flattenVisible(nodes, { rootId, expanded })   // collapsed subtrees are not walked
```

`test/virtual-window.test.mjs` - 8 checks:

| Check | Why |
|---|---|
| first viewport starts at 0 with no top pad | the trivial case must not pad |
| scrolling moves the window **and both pads** | a wrong bottom pad makes the scrollbar lie |
| overscan widens both sides | prevents blank flashes |
| never exceeds the model | off-by-one at the end is the classic bug |
| scrolling past the end is clamped **and reported** | the caller must be able to fix its offset |
| empty/NaN model -> empty window | profile data can be sparse |
| collapsed nodes hide their subtree | the tree rule from the source |
| expanding walks in order with depth | row order must match what the user sees expanded |

## What is NOT wired

The console still renders the architecture children it has (1226 nodes total, but each level shows a
handful). The window helper exists for the moment a level holds hundreds of rows; wiring it now would
add a branch no fixture exercises. Status: **module implemented and tested, page integration pending
by design** - the opposite trade-off from docs/63, and stated instead of implied.

## Regression

```
console e2e   60/60
panel e2e     29/29
designer e2e  30/30
selftest      67 passed / 6 skipped
package tests 8 + 5 + 7 + 7 + 7 + 8 + 7 + 8 = 57 checks
```
