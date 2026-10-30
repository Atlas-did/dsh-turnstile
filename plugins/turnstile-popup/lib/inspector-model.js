// Inspector model: one selection, two pages.
//
// Modelled on System Informer's property sheet (jobprp.c): the sheet is `PROPSHEETHEADER` with
// pages, each page has an Open/Close lifecycle and a live subscription, and the header sets
// PSH_NOAPPLYNOW - there is no global Apply button; each page owns its own commit.
//
// Here a "page" is pure data: properties (read-only facts) and actions (commands with an explicit
// enabled flag and a reason when disabled). Rendering and clicking stay in the browser.

export function buildInspector(selection, data) {
  const out = { title: '属性检查器', subtitle: '', properties: [], actions: [] };
  if (!selection || !data) return out;

  if (selection.kind === 'plugin') {
    const p = (data.plugins || []).find((x) => x.name === selection.title);
    if (!p) { out.subtitle = '该插件已不在当前清单中'; return out; }
    out.title = p.name;
    out.subtitle = p.disabled ? '已停用' : (p.missing ? '未安装' : '启用中');
    out.properties = [
      { label: '版本', value: p.version || '(未声明)' },
      { label: '行 id', value: (p.rows || []).join(', ') || '(无配置行)' },
      { label: 'UI 面', value: ((p.ui || []).length || 0) + ' 个' + ((p.ui || []).length ? ': ' + p.ui.join(', ') : '') },
      { label: '位置', value: p.anchor || '(未声明，硬编码)' },
    ];
    out.actions = [
      { id: 'toggle', label: p.disabled ? '启用插件' : '停用插件', enabled: (p.rows || []).length > 0, reason: (p.rows || []).length ? '' : '没有配置行，无法写补丁' },
      { id: 'anchor', label: '改位置', enabled: (p.rows || []).length > 0, reason: (p.rows || []).length ? '' : '没有配置行，无法写补丁' },
      { id: 'locate', label: '在架构中定位', enabled: true, reason: '' },
    ];
    return out;
  }

  if (selection.kind === 'surface') {
    const s = (data.surfaces || []).find((x) => x.surface === selection.title);
    if (!s) { out.subtitle = '该 UI 面已不在当前清单中'; return out; }
    out.title = s.surface;
    out.subtitle = s.count + ' 个插件 · ' + ((s && s.hardcoded && s.hardcoded.length) || 0) + ' 个硬编码';
    out.properties = [
      { label: '插件数', value: String(s.count) },
      { label: '插件', value: (s.plugins || []).map((p) => p.name).join(', ') },
      { label: '可配置', value: String(((s.plugins || []).length - ((s.hardcoded || []).length))) },
    ];
    out.actions = [{ id: 'fuse', label: '生成融合建议', enabled: s.count > 1, reason: s.count > 1 ? '' : '只有一个插件，无需融合' }];
    return out;
  }

  if (selection.kind === 'check') {
    const c = (data.report && data.report.checks || []).find((x) => x.name === selection.title);
    if (!c) { out.subtitle = '该检查不在最近一次报告里'; return out; }
    out.title = c.name;
    out.subtitle = c.ok ? '通过' : '未通过';
    out.properties = [
      { label: '结果', value: c.ok ? 'ok' : 'fail' },
      { label: '耗时', value: (c.ms || 0) + ' ms' },
      { label: '发现', value: String((c.findings || []).length) },
    ];
    out.actions = [{ id: 'export', label: '导出该检查的结果', enabled: true, reason: '' }];
    return out;
  }

  // Any other selection (an architecture node, a history row) still gets its own values and the
  // actions that make sense for a node, instead of an empty inspector.
  if (selection.properties && typeof selection.properties === 'object') {
    out.title = selection.title || selection.id || '选中项';
    out.properties = Object.keys(selection.properties).map((label) => ({ label, value: String(selection.properties[label]) }));
    out.actions = selection.archId ? [{ id: 'locate', label: '在架构中定位', enabled: true, reason: '' }] : [];
    return out;
  }

  return out;
}

if (typeof window !== 'undefined') window.TurnstileInspector = { buildInspector };
