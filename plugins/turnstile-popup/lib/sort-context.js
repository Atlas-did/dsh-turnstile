// Deterministic row ordering, modelled on System Informer's PH_CM_SORT_CONTEXT (colmgr.c):
// a sort is a context (column + direction + a tie-break rule), not an ad-hoc comparator, so the
// same context always produces the same order no matter what order the data arrived in.

export const SORT_KEYS = ['name', 'version', 'status', 'surfaces', 'rows'];

export function valueOf(row, key) {
  if (!row) return '';
  switch (key) {
    case 'version': return String(row.version || '');
    case 'status': return row.missing ? 'missing' : (row.disabled ? 'off' : 'on');
    case 'surfaces': return (row.ui || []).length;
    case 'rows': return (row.rows || []).length;
    default: return String(row.name || '');
  }
}

/** Compare two rows under a sort context. Ties always fall back to the name, ascending. */
export function compareRows(a, b, ctx) {
  const key = ctx && SORT_KEYS.indexOf(ctx.key) !== -1 ? ctx.key : 'name';
  const dir = ctx && ctx.dir === -1 ? -1 : 1;
  const av = valueOf(a, key);
  const bv = valueOf(b, key);
  let c;
  if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
  else c = String(av).localeCompare(String(bv));
  if (c === 0 && key !== 'name') c = String(a && a.name || '').localeCompare(String(b && b.name || ''));
  if (c === 0) c = String(a && a.name || '').localeCompare(String(b && b.name || ''));
  return c * dir;
}

/** Stable, order-independent sort: the input order never leaks into the output. */
export function orderedRows(rows, ctx) {
  return (rows || []).slice().sort((a, b) => compareRows(a, b, ctx));
}

// The console loads this file as a classic script; the package tests import it as a module.
if (typeof window !== 'undefined') {
  window.TurnstileSort = { SORT_KEYS, valueOf, compareRows, orderedRows };
}
