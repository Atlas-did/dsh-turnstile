// Selection model for the plugin table, shaped after LowCodeEngine's SettingTarget:
// a selection is data (ids + anchor), every batch read reports mixed values explicitly, and a batch
// write is produced as a list of operations instead of being executed by the UI.

export const EMPTY = { ids: [], anchor: null };

export function select(state, id, { ctrl = false, shift = false, order = [] } = {}) {
  const cur = state || EMPTY;
  if (shift && cur.anchor) {
    const a = order.indexOf(cur.anchor);
    const b = order.indexOf(id);
    if (a !== -1 && b !== -1) {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { ids: order.slice(lo, hi + 1), anchor: cur.anchor };
    }
  }
  if (ctrl) {
    const has = cur.ids.indexOf(id) !== -1;
    return { ids: has ? cur.ids.filter((x) => x !== id) : cur.ids.concat(id), anchor: id };
  }
  return { ids: [id], anchor: id };
}

/** Values shared by every selected row: `mixed` is true when they disagree. */
export function commonValue(rows, key) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { value: undefined, mixed: false };
  const first = list[0] ? list[0][key] : undefined;
  const mixed = list.some((r) => (r ? r[key] : undefined) !== first);
  return { value: mixed ? undefined : first, mixed };
}

/**
 * Operations for a batch change. A plugin without a config row cannot be toggled, so it is reported as
 * skipped with a reason rather than silently dropped.
 */
export function batchToggle(rows, disable) {
  const ops = [];
  const skipped = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    if (!(r.rows || []).length) { skipped.push({ name: r.name, reason: '该插件没有 profile 行' }); continue; }
    ops.push({ type: 'toggle', package: r.name, disable: Boolean(disable) });
  }
  return { ops, skipped };
}

export function describe(state, rows) {
  const ids = (state || EMPTY).ids;
  if (!ids.length) return '未选中';
  if (ids.length === 1) return '已选 1 个';
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && ids.indexOf(r.name) !== -1);
  const disabled = commonValue(list, 'disabled');
  const parts = ['已选 ' + ids.length + ' 个'];
  parts.push(disabled.mixed ? '停用状态不一致' : (disabled.value ? '全部已停用' : '全部启用中'));
  return parts.join(' · ');
}

if (typeof window !== 'undefined') window.TurnstileSelection = { EMPTY, select, commonValue, batchToggle, describe };
