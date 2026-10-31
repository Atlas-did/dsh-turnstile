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
## 源码复核（2026-10-31，逐行核对，替换掉之前的「按原理复述」）

来源确认：**System Informer 的 `phlib/treenew.c`**，10,753 行 / 332,090 字节（GitHub contents API 解码）。

### ① 只画可视行 —— 已证实（这是最关键的一条）

`PhTnpPaint`（定义在 **7682 行**）用除法算首末行，然后**只遍历这几十行**：

```c
// 7735-7739 行
firstRowToUpdate = (PaintRect->top - Context->HeaderHeight) / Context->RowHeight;
lastRowToUpdate  = (PaintRect->bottom - 1 - Context->HeaderHeight) / Context->RowHeight;
```

### ② 几何按「范围」算，不按「列表」算 —— 已证实

`PhTnpGetRowRects`（**5842 行**）：

```c
if (End >= Context->FlatList->Count) return FALSE;
startY = Context->HeaderHeight + ((LONG)Start - Context->VScrollPosition) * Context->RowHeight;
endY   = Context->HeaderHeight + ((LONG)End   - Context->VScrollPosition) * Context->RowHeight;
```

**固定行高** + 滚动偏移参与计算 → 任意区间的位置是 O(1)，不需要测量每一行。

### ③ 只重画变化的部分 —— 已证实

`PhpTnpInvalidateRows`（**163 行**）算出该范围的矩形，与内容矩形求交，只失效交集；
`TNM_INVALIDATENODE` / `TNM_INVALIDATENODES`（2894 行起）也是走同一个函数。

### ④ **之前的说法要更正：它确实是「先拍平成数组」**

我原先写「模型是树，控件惰性查询，不是预扁平化数组」——**这条是错的**。
实际上 `Context->FlatList` 就是拍平后的数组；结构变化时（5409 行）会：

```c
PhClearList(Context->FlatList);
for (i = 0; i < numberOfChildren; i++) PhTnpInsertNodeChildren(Context, children[i], 0);
```

**也就是说：整棵树每次结构变化都要重新拍平（O(n)），省下来的是「绘制与几何」那部分（O(可视行)）。**
这更接近真实的取舍：拍平一次换取 O(1) 的索引与行位置计算；不拍平就得每帧递归找第 N 行。

### ⑤ 子节点怎么来 —— 回调，不是容器

`PhTnpGetNodeChildren`（**5266 行**）通过 `PH_TREENEW_GET_CHILDREN` 回调向调用方要子节点数组，
控件自己不拥有树结构。所以「懒」体现在**取子节点这件事由应用负责**，而不是控件延迟建行。

### 六、对我们实现的结论

`lib/virtual-window.js` 的 `computeWindow` 与 ② 是同一个模型（固定行高 + 偏移 → 区间），这部分**站得住**。
但 ④ 提醒我们：真正的性能问题往往在「结构变化时重拍平」，所以 1200 节点场景下，
**展开/折叠一次的开销是 O(n)**，滚动才是 O(可视行)。我们目前只做了后者。
