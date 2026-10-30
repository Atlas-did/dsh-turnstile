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

if (typeof window !== 'undefined') window.TurnstileWindow = { computeWindow, flattenVisible };
