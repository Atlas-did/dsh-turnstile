'use strict';
// 控制台定位：搜索索引、URL 片段编解码（方案 01-A/B）。纯函数，便于离线测试。
export const NAV_SCHEMA = 'turnstile/console-nav@1';

const navText = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

/** 视图清单来自页面已有的 views 数组，不另抄一份。 */
export function buildIndex({ views = [], plugins = [], surfaces = [], checks = [], actions = [] } = {}) {
  const items = [];
  for (const [view, label] of views) items.push({ kind: 'view', id: view, label: navText(label), view, hint: '打开视图', mutating: false });
  for (const p of plugins) items.push({ kind: 'plugin', id: navText(p.name), label: navText(p.name), view: 'plugins', hint: p.disabled ? '已停用' : '已启用', mutating: false });
  for (const s of surfaces) items.push({ kind: 'surface', id: navText(s.surface || s), label: navText(s.surface || s), view: 'surfaces', hint: 'UI 面', mutating: false });
  for (const c of checks) items.push({ kind: 'check', id: navText(c.name), label: navText(c.name), view: 'checks', hint: c.ok ? '通过' : '需检查', mutating: false });
  for (const a of actions) items.push({ kind: 'action', id: navText(a.id), label: navText(a.label), view: navText(a.view || ''), hint: '只生成计划，不直接写入', mutating: true });
  return items;
}

const score = (item, q) => {
  const label = item.label.toLowerCase();
  if (!q) return 1;
  if (label === q) return 100;
  if (label.startsWith(q)) return 60;
  if (label.includes(q)) return 30;
  return 0;
};

/** 搜索：对象 / 视图 / 动作三组；动作永远标 mutating（最多生成计划）。 */
export function search(index, query, limit = 8) {
  const q = navText(query).toLowerCase();
  const rows = (Array.isArray(index) ? index : [])
    .map((item) => ({ item, s: score(item, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(a.item.label).localeCompare(String(b.item.label)))
    .map((x) => x.item);
  const groups = { objects: [], views: [], actions: [] };
  for (const item of rows) {
    if (item.kind === 'action') { if (groups.actions.length < limit) groups.actions.push(item); }
    else if (item.kind === 'view') { if (groups.views.length < limit) groups.views.push(item); }
    else if (groups.objects.length < limit) groups.objects.push(item);
  }
  return { query: q, groups, total: rows.length };
}

/** URL 片段：只放 view/kind/id，不放 token、绝对路径或正文。 */
export function buildHash({ view, kind, id } = {}) {
  const parts = [];
  if (view) parts.push('view=' + encodeURIComponent(navText(view, 40)));
  if (kind) parts.push('kind=' + encodeURIComponent(navText(kind, 40)));
  if (id) parts.push('id=' + encodeURIComponent(navText(id, 180)));
  return parts.length ? '#' + parts.join('&') : '';
}

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const out = { view: '', kind: '', id: '' };
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    const key = pair.slice(0, at);
    if (!['view', 'kind', 'id'].includes(key)) continue;
    try { out[key] = decodeURIComponent(pair.slice(at + 1)); } catch { out[key] = ''; }
  }
  return out;
}

export function hashHasSecret(hash) {
  return /token=|api[_-]?key|secret|password|[A-Za-z]:[\\/]|\/Users\//i.test(String(hash || ''));
}

if (typeof window !== 'undefined') {
  window.TurnstileConsoleNav = { NAV_SCHEMA, buildIndex, search, buildHash, parseHash, hashHasSecret };
}
