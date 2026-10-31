# 增量扁平索引：展开/折叠不再重走全树

## 为什么做

读完 `phlib/treenew.c` 后发现两件事（见 docs/65 的复核）：

1. 它的确把树**拍平成数组**（`Context->FlatList`），结构变化时 `PhClearList` + 逐个重插 → **O(n)**；
2. 真正省的是**绘制与几何**：`PhTnpPaint` 用除法算首末行，只画那几十行 → **O(可视行)**。

我们之前只做了第 2 件，第 1 件没做。这次补上。

## 做了什么

`lib/virtual-window.js` 新增：

```js
createFlatIndex(nodes, { rootId, expanded })   // 一次性建索引（O(n)，可接受）
expandAt(index, id)    // 只把该子树的行插到它后面，其余原地不动（splice=memmove）
collapseAt(index, id)  // 只删它后面连续的更深层级行
toggleAt(index, id)
visibleSlice(index, { start, end })  // 配合 computeWindow 用
```

返回值带 `stats.walked`（本次访问的模型节点数），测试用它证明**不是 O(n)**。

## 实测（本机 Node 25）

| 模型节点 | 建索引 | `flattenVisible`（全树 DFS） | 展开一个节点 | 访问节点数 |
|---|---|---|---|---|
| 1,501 | 0.89 ms | 0.50 ms | **0.164 ms** | 4 |
| 5,001 | 1.08 ms | 1.24 ms | **0.089 ms** | 4 |
| 100,001 | 19.33 ms | 10.75 ms | **2.086 ms** | 4 |

结论：**展开一个 4 行子树，无论树多大都只访问 4 个节点**；10 万节点时全树 DFS 要 10.75ms，增量展开 2.09ms。

## 但要说实话：当前规模下不是瓶颈

控制台现在最深的一棵树是 **1,226 个节点**。在这个规模：

- 全树 DFS ≈ 0.5ms，一次展开重算整条列表，人眼完全感觉不到；
- 也就是说：**这层优化现在不会让页面变快**，它是给「上万节点」准备的。

所以我**没有**强行改 `console.html` 的渲染路径（那是 44KB 的内联脚本，改动风险大于收益），
而是把能力放进库、用 19 条测试锁住，等节点数真上来时直接换用。

## 测试（`test/virtual-window.test.mjs`，8 → 19 条）

| 检查 | 证明什么 |
|---|---|
| 展开 root 后多出 100 行 | 插入位置正确 |
| 展开只访问 100 个节点（不是 152） | **O(子树)，不是 O(n)** |
| 折叠 walked 等于删掉的行数 | 折叠只扫被删区间 |
| 折叠后 pos 里没有幽灵条目 | 修掉了一个真 bug（stale map） |
| 来回切换顺序稳定 | splice 后位置表仍然一致 |
| 可视区间切片正确 | 与 `computeWindow` 对得上 |

## 一个被测试抓到的真 bug

第一版 `collapseAt` 只 `splice` 了 `flat`，忘了 `pos.delete`。结果折叠后 `pos` 里还留着已删除节点的位置，
后续 `expandAt` 会拿到错位索引。测试「折叠后 big 在、子节点不在」当场判红。已修。
