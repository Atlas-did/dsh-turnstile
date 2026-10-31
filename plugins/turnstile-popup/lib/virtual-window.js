// Virtual window: only the rows a viewport can show get built.
//
// Shape taken from System Informer's TreeNew (phlib/treenew.c, read at 332 KB): the control keeps the
// whole model, tracks `VScrollPosition`, and computes row rectangles for a *range* (`Start`..`End`)
// before invalidating just that range. Children are asked from a parent node, not flattened up front.
//
// Nothing here touches the DOM: the page calls it and renders what it returns.

/**
 * Which slice of rows is visible, plus the padding needed to keep the scrollbar honest.
 * Overscan rows are added above and below so fast scrolling does not flash empty space.
 */
export function computeWindow({ total, scrollTop = 0, rowHeight = 28, viewportHeight = 600, overscan = 6 }) {
  if (!Number.isFinite(total) || total <= 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0, clamped: false };
  const h = rowHeight > 0 ? rowHeight : 28;
  const vh = viewportHeight > 0 ? viewportHeight : 0;
  const rawStart = Math.floor((scrollTop > 0 ? scrollTop : 0) / h);
  const visible = Math.ceil(vh / h);
  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(total, rawStart + visible + overscan);
  return {
    start,
    end,
    topPad: start * h,
    bottomPad: Math.max(0, (total - end) * h),
    // A scroll position past the end is clamped, and the caller is told so it can fix its offset.
    clamped: rawStart > 0 && start >= total,
  };
}

/**
 * Visible rows of a tree, honouring collapsed nodes: a child of a collapsed parent is not walked.
 * Mirrors the TreeNew rule that the control asks a node for its children instead of holding a list.
 */
export function flattenVisible(nodes, { rootId = null, expanded = {} } = {}) {
  const byParent = new Map();
  for (const n of nodes || []) {
    const key = n.parent === undefined ? null : n.parent;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }
  const out = [];
  const walk = (parentId, depth) => {
    for (const n of byParent.get(parentId) || []) {
      out.push({ node: n, depth });
      if (expanded[n.id]) walk(n.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

if (typeof window !== 'undefined') {
  window.TurnstileWindow = { computeWindow, flattenVisible, createFlatIndex, expandAt, collapseAt, toggleAt, visibleSlice };
}
/**
 * 增量扁平索引：展开/折叠只动「那棵子树」对应的区间，不重走整棵树。
 *
 * 为什么需要它（读完 phlib/treenew.c 之后）：TreeNew 在结构变化时会 PhClearList + 逐个重插，
 * 那是 O(n)（见 docs/65 的复核）。我们是 JS，重建整条数组还要重新分配对象，代价更明显。
 * 这里只做两件事：
 *   1. 建索引时走一次全树（O(n)，一次性）；
 *   2. 之后 expand/collapse 只处理目标子树（O(子树)），其余行原地不动（splice 是 memmove）。
 *
 * 返回值里的 stats.walked 是被访问的模型节点数——测试用它证明「不是 O(n)」。
 */
export function createFlatIndex(nodes, { rootId = null, expanded = {} } = {}) {
  const children = new Map();
  for (const n of nodes || []) {
    const key = n.parent === undefined ? null : n.parent;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(n);
  }
  const flat = [];
  const pos = new Map();
  const open = { ...expanded };
  const push = (n, depth) => { pos.set(n.id, flat.length); flat.push({ id: n.id, depth, node: n }); };
  const walk = (parentId, depth) => {
    for (const n of children.get(parentId) || []) {
      push(n, depth);
      if (open[n.id] && children.has(n.id)) walk(n.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return { nodes, children, flat, pos, expanded: open, rootId };
}

/** 把 pos 里 index 之后的所有位置按 delta 平移（只动 map，不动对象）。 */
function shiftPositions(index, from, delta) {
  for (let i = from; i < index.flat.length; i += 1) index.pos.set(index.flat[i].id, i);
  if (delta) for (let i = from; i < index.flat.length; i += 1) index.pos.set(index.flat[i].id, i);
}

/** 展开一个节点：只把它的子树行插到它后面。 */
export function expandAt(index, id) {
  if (!index.children.has(id) || index.expanded[id]) return { index, stats: { walked: 0 } };
  const at = index.pos.get(id);
  if (at === undefined) return { index, stats: { walked: 0 } };
  const parentDepth = index.flat[at].depth;
  const rows = [];
  let walked = 0;
  const walk = (parentId, depth) => {
    for (const n of index.children.get(parentId) || []) {
      walked += 1;
      rows.push({ id: n.id, depth, node: n });
      if (index.expanded[n.id] && index.children.has(n.id)) walk(n.id, depth + 1);
    }
  };
  walk(id, parentDepth + 1);
  if (!rows.length) return { index, stats: { walked } };
  index.flat.splice(at + 1, 0, ...rows);
  index.expanded[id] = true;
  for (let i = at + 1; i < index.flat.length; i += 1) index.pos.set(index.flat[i].id, i);
  return { index, stats: { walked } };
}

/** 折叠一个节点：只删掉它后面连续的更深层级行。 */
export function collapseAt(index, id) {
  if (!index.expanded[id]) return { index, stats: { walked: 0 } };
  const at = index.pos.get(id);
  if (at === undefined) return { index, stats: { walked: 0 } };
  const depth = index.flat[at].depth;
  let end = at + 1;
  while (end < index.flat.length && index.flat[end].depth > depth) end += 1;
  const removed = end - at - 1;
  if (removed > 0) {
    // 先把要删掉的 id 从位置表摘掉，否则 pos 会留下幽灵条目
    for (let i = at + 1; i < end; i += 1) index.pos.delete(index.flat[i].id);
    index.flat.splice(at + 1, removed);
    for (let i = at + 1; i < index.flat.length; i += 1) index.pos.set(index.flat[i].id, i);
  }
  index.expanded[id] = false;
  return { index, stats: { walked: removed } };
}

export function toggleAt(index, id) {
  return index.expanded[id] ? collapseAt(index, id) : expandAt(index, id);
}

/** 渲染用：拿可视区间的那一段（配合 computeWindow）。 */
export function visibleSlice(index, { start = 0, end = index.flat.length } = {}) {
  return index.flat.slice(start, Math.min(end, index.flat.length));
}
