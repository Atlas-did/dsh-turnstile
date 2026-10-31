'use strict';
// wxFormBuilder/Pygubu-inspired command designer: the canvas is a view; generated output is the product.
(() => {
  const css = document.createElement('style');
  css.textContent = `
    .designer-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.designer-toolbar .btn{min-height:30px}.dirty{color:var(--amber)}.designer-palette{display:flex;gap:5px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);background:var(--panel);padding:8px;border-radius:9px;margin-bottom:10px}.designer-palette .tab{padding:5px 10px}.designer-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:10px;min-height:430px}.object-tree,.designer-stage{border:1px solid var(--line);border-radius:9px;background:var(--panel);min-width:0;overflow:hidden}.object-head,.stage-head{padding:9px 11px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}.tree-root,.tree-item{display:block;width:100%;text-align:left;border:0;border-left:2px solid transparent;background:none;color:var(--text);padding:8px 10px;cursor:pointer}.tree-item{padding-left:25px;font:11px var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tree-item.active{background:#72b7ff12;border-left-color:var(--blue);color:var(--blue)}.tree-item .tree-state{float:right;color:var(--muted)}.designer-stage{padding-bottom:12px}.designer-stage .stage-head{display:flex;gap:4px;padding:0;overflow:auto}.designer-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px}.designer-card{border:1px solid var(--line);border-radius:8px;padding:10px;background:#0f1821}.designer-card span{display:block;color:var(--muted);font-size:10px}.designer-card strong{font:12px var(--mono);word-break:break-word}.command-list{margin:0 12px;border:1px solid var(--line);border-radius:8px;overflow:hidden}.command-row{display:grid;grid-template-columns:28px minmax(0,1fr) repeat(4,30px);align-items:center;gap:3px;padding:6px;border-bottom:1px solid #ffffff0c}.command-row:last-child{border-bottom:0}.command-row.active{background:#72b7ff10}.command-row code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.command-row button{padding:2px;min-height:25px}.generated{margin:0;padding:16px;min-height:390px;max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11px/1.6 var(--mono);color:#cfe3f3}.designer-error{margin:10px 12px;padding:8px;border-left:2px solid var(--red);color:var(--red);background:#ff827908}.designer-status{padding:9px 12px;color:var(--muted);font-size:11px}.prop-collapse{width:100%;text-align:left;border:0;background:#ffffff05;color:var(--muted);padding:7px 4px;cursor:pointer}.property-input{width:100%;background:#0a1118;color:var(--text);border:1px solid var(--line);border-radius:5px;padding:6px;font:11px var(--mono)}.property-check{display:flex;align-items:center;gap:8px;padding:7px 0}.event-row{padding:8px 0;border-bottom:1px solid #ffffff0c}.event-row code{display:block;color:var(--blue);margin-bottom:5px}.designer-dialog{position:fixed;inset:0;z-index:45;background:#05090dc9;display:grid;place-items:center;padding:24px}.designer-dialog .patch-card{width:min(1050px,96vw)}.queue-empty{padding:22px;text-align:center;color:var(--muted)}@media(max-width:800px){.designer-grid{grid-template-columns:1fr}.object-tree{max-height:190px;overflow:auto}.designer-summary{grid-template-columns:1fr}.command-row{grid-template-columns:24px minmax(0,1fr) repeat(4,28px)}}
  `;
  document.head.append(css);
  const ds = {
    loadedFor: '', package: '', palette: 'Common', editor: 'designer', inspector: 'properties',
    operations: [], past: [], future: [], saved: '[]', selectedOp: -1, anchorDraft: '', timeline: [],
    preview: null, previewKey: '', previewSeq: 0, busy: false, error: '', dialog: false,
    groups: { identity: true, config: true, source: true },
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const signature = () => JSON.stringify(ds.operations);
  const selected = () => state.data?.plugins.find((p) => p.name === ds.package) || null;
  const currentKey = () => (state.data?.profile.dir || '') + '|' + signature();
  const dirty = () => signature() !== ds.saved;
  const opLabel = (op) => op.type === 'toggle' ? (op.disable ? '停用 ' : '启用 ') + op.package : (op.anchor ? '位置 ' : '清除位置 ') + op.package + (op.anchor ? ' → ' + op.anchor : '');
  const currentAnchor = (name) => {
    for (const surface of state.data?.occupancy?.surfaces || []) {
      if (surface.anchors?.[name]) return surface.anchors[name];
    }
    return '';
  };
  const effective = (plugin) => {
    let disabled = Boolean(plugin?.disabled), anchor = currentAnchor(plugin?.name);
    for (const op of ds.operations) {
      if (op.package !== plugin?.name) continue;
      if (op.type === 'toggle') disabled = op.disable;
      if (op.type === 'anchor') anchor = op.anchor;
    }
    return { disabled, anchor };
  };
  function persist() {
    try { localStorage.setItem('turnstile.designer.draft.' + state.data.profile.name, signature()); } catch {}
  }
  function loadDraft() {
    fetchHookRules();
    const id = state.data.profile.dir;
    if (ds.loadedFor === id) return;
    ds.loadedFor = id; ds.operations = []; ds.past = []; ds.future = []; ds.saved = '[]'; ds.preview = null; ds.previewKey = ''; ds.timeline = undefined;
    try {
      const saved = JSON.parse(localStorage.getItem('turnstile.designer.draft.' + state.data.profile.name) || '[]');
      if (Array.isArray(saved)) ds.operations = saved.filter((op) => op && ['toggle', 'anchor'].includes(op.type) && typeof op.package === 'string').slice(0, 100);
      ds.saved = localStorage.getItem('turnstile.designer.savepoint.' + state.data.profile.name) || '[]';
    } catch {}
    ds.package = state.selected?.plugin?.name || state.data.plugins[0]?.name || '';
    ds.anchorDraft = effective(selected()).anchor;
  }
  function mutate(fn, label) {
    // The timeline runs beside past/future, never instead of them: undo/redo behaviour is untouched.
    ds.past.push(copy(ds.operations)); if (ds.past.length > 100) ds.past.shift();
    ds.future = []; fn();
    const H = window.TurnstileHistory;
    if (H) { if (!ds.timeline || !Array.isArray(ds.timeline.steps)) ds.timeline = H.createTimeline({ limit: 100 }); H.append(ds.timeline, { state: copy(ds.operations), kind: H.STEP_KIND.EDIT, label: label || '修改队列', at: Date.now() }); }
    ds.selectedOp = Math.min(ds.selectedOp, ds.operations.length - 1);
    ds.error = ''; ds.dialog = false; persist(); render();
  }
  function addOperation(op) {
    const p = selected();
    if (!p || p.missing || !p.row) { ds.error = '选中的插件没有可写入的配置行。'; render(); return; }
    enqueue({ ...op, package: p.name });
  }
  function addAnchor(anchor) { addOperation({ type: 'anchor', anchor }); }
  function undo() {
    if (!ds.past.length) return;
    ds.future.push(copy(ds.operations)); ds.operations = ds.past.pop(); ds.dialog = false; persist(); render();
  }
  function redo() {
    if (!ds.future.length) return;
    ds.past.push(copy(ds.operations)); ds.operations = ds.future.pop(); ds.dialog = false; persist(); render();
  }
  function savePoint() {
    ds.saved = signature(); persist();
    try { localStorage.setItem('turnstile.designer.savepoint.' + state.data.profile.name, ds.saved); } catch {}
    state.notice = '已保存设计器草稿与保存点；尚未写入 mini。'; render();
  }
  async function designerRequest(dryRun) {
    const response = await fetch('/turnstile/designer' + tokenSuffix(), {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: ds.operations, dryRun, expected: dryRun ? undefined : ds.preview?.before }),
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || 'HTTP ' + response.status); error.status = response.status; throw error; }
    return data;
  }
  async function ensurePreview() {
    const key = currentKey();
    if (ds.busy || ds.previewKey === key) return;
    const seq = ++ds.previewSeq; ds.busy = true; ds.error = '';
    try {
      const result = await designerRequest(true);
      if (seq === ds.previewSeq && key === currentKey()) { ds.preview = result; ds.previewKey = key; }
    } catch (error) { if (seq === ds.previewSeq) { ds.error = error.message; ds.preview = null; ds.previewKey = key; } }
    finally { if (seq === ds.previewSeq) { ds.busy = false; if (state.view === 'designer') render(); } }
  }
  function cliCode() {
    const quote = (v) => '"' + String(v).replace(/"/g, '\\"') + '"';
    const dir = state.data.profile.dir;
    return ds.operations.map((op) => op.type === 'toggle'
      ? 'node tools/manage.mjs ' + quote(dir) + (op.disable ? ' --disable ' : ' --enable ') + quote(op.package) + ' --yes'
      : 'node tools/anchor.mjs ' + quote(dir) + ' --package ' + quote(op.package) + ' --anchor ' + quote(op.anchor || 'clear') + ' --apply').join('\n') || '# 没有命令';
  }
  function diffCode() {
    // Classification lives in lib/diff-state.js (unit tested); this function only formats it.
    const D = window.TurnstileDiff;
    if (D && D.classifyDiff) {
      const c = D.classifyDiff(ds.preview?.before || '', ds.preview?.after || '');
      if (c.tooBig) return '文件较大，请使用 Patch YAML 标签查看完整生成结果。';
      ds.diffSummary = c.summary;
      return c.lines.map((l) => l.marker + ' ' + l.text).join('\n');
    }
    const a = (ds.preview?.before || '').split('\n'), b = (ds.preview?.after || '').split('\n');
    if (a.length * b.length > 160000) return '文件较大，请使用 Patch YAML 标签查看完整生成结果。';
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { out.push('  ' + a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push('- ' + a[i++]); else out.push('+ ' + b[j++]); }
    while (i < a.length) out.push('- ' + a[i++]); while (j < b.length) out.push('+ ' + b[j++]);
    return out.join('\n');
  }
  function generatedCode() {
    if (ds.editor === 'yaml') return ds.preview?.after || ds.preview?.before || '正在生成…';
    if (ds.editor === 'json') return JSON.stringify({ profile: state.data.profile.name, operations: ds.preview?.operations || ds.operations, changed: ds.preview?.changed || false }, null, 2);
    if (ds.editor === 'cli') return cliCode();
    if (ds.editor === 'diff') return diffCode();
    return '';
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const area = node('textarea', { text }); document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
    state.notice = '已复制生成结果；没有写入 mini。'; render();
  }
  function downloadCode() {
    const ext = { yaml: 'yml', json: 'json', cli: 'sh', diff: 'diff' }[ds.editor] || 'txt';
    const url = URL.createObjectURL(new Blob([generatedCode()], { type: 'text/plain;charset=utf-8' }));
    const a = node('a', { href: url, download: 'turnstile-design.' + ext }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectDesignerPlugin(p) {
    ds.package = p.name; ds.anchorDraft = effective(p).anchor; state.selected = selectionForPlugin(p); state.inspectorTab = 'properties'; render();
  }
  function spreadSurface() {
    const p = selected(); const surface = state.data.surfaces.find((s) => p && p.ui.includes(s.surface) && s.plugins.length > 1);
    if (!surface) { ds.error = '选中插件不在共享 UI 面，无需分散。'; render(); return; }
    const anchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const eligible = surface.plugins.filter((item) => item.rows?.length);
    const skipped = surface.plugins.filter((item) => !item.rows?.length).map((item) => item.name);
    if (!eligible.length) { ds.error = '共享面里的插件都没有可写配置行。'; render(); return; }
    state.notice = skipped.length ? '已跳过无配置行的插件：' + skipped.join(', ') : '已为共享面生成四角分散方案。';
    mutate(() => eligible.forEach((item, i) => ds.operations.push({ type: 'anchor', package: item.name, anchor: anchors[i % anchors.length] })));
  }
  // Batch slice: the table's multi-selection becomes queue entries, so one preview covers all of them.
  // Row-less plugins are reported, never silently dropped.
  function applyBatchToQueue(disable) {
    const S = window.TurnstileSelection;
    const picked = (state.picked || { ids: [] }).ids;
    if (!S || !picked.length) { ds.error = '先在插件清单里多选若干插件（Ctrl / Shift）。'; render(); return; }
    const rows = state.data.plugins.filter((x) => picked.indexOf(x.name) !== -1);
    const batch = S.batchToggle(rows, disable);
    if (!batch.ops.length) { ds.error = '所选插件都没有可写配置行。'; render(); return; }
    const room = 100 - ds.operations.length;
    if (room <= 0) { ds.error = '一次最多生成 100 条命令。'; render(); return; }
    mutate(() => batch.ops.slice(0, room).forEach((op) => ds.operations.push(op)));
    const parts = ['已加入 ' + Math.min(batch.ops.length, room) + ' 条批量命令'];
    if (batch.ops.length > room) parts.push('队列已满，' + (batch.ops.length - room) + ' 条未加入');
    if (batch.skipped.length) parts.push('跳过 ' + batch.skipped.length + ' 个：' + batch.skipped.map((s) => s.name).join(', '));
    state.notice = parts.join('；');
  }
  function jumpTo(index) {
    const H = window.TurnstileHistory;
    if (!H || !ds.timeline || !H.jumpTo(ds.timeline, index)) return;
    ds.future.push(copy(ds.operations));
    ds.operations = copy(H.current(ds.timeline) || []);
    ds.selectedOp = Math.min(ds.selectedOp, ds.operations.length - 1);
    ds.previewKey = ''; ds.dialog = false; persist(); render();
  }
  function renderTimeline() {
    const box = node('div', { class: 'designer-timeline', 'data-testid': 'designer-timeline' });
    const H = window.TurnstileHistory;
    const rowsList = H && ds.timeline && Array.isArray(ds.timeline.steps) ? H.rows(ds.timeline) : [];
    box.append(node('div', { class: 'side-title', text: '历史 · ' + rowsList.length }));
    if (!rowsList.length) { box.append(node('p', { class: 'hint', text: '还没有改动。' })); return box; }
    rowsList.slice().reverse().forEach((row) => {
      const time = new Date(row.at).toLocaleTimeString('zh-CN', { hour12: false });
      const count = H && ds.timeline.steps[row.index] ? ds.timeline.steps[row.index].state.length : 0;
      box.append(btn(time + ' · ' + row.label + ' · ' + count + ' 条', () => jumpTo(row.index), 'history-' + row.index, 'history-row' + (row.current ? ' active' : '')));
    });
    return box;
  }
  // Declared once, rendered and validated from the same declaration (lib/field-schema.js).
  function configFields() {
    const FS = window.TurnstileFields;
    if (!FS) return null;
    return [
      FS.field({ key: 'disabled', label: '停用', type: 'boolean', group: 'Config / 可编辑属性' }),
      FS.field({ key: 'anchor', label: 'anchor', group: 'Config / 可编辑属性', defaultValue: '',
        validate: (v) => (!v || ['top-left', 'top-right', 'bottom-left', 'bottom-right', ''].indexOf(v) !== -1 ? true : '位置必须是 top-left / top-right / bottom-left / bottom-right 或留空') }),
    ];
  }
  function configValues(p) {
    const eff = p ? effective(p) : { disabled: false, anchor: '' };
    return { disabled: Boolean(eff.disabled), anchor: ds.anchorDraft || eff.anchor || '' };
  }
  // A real use of the hook layer: the queue-cap rule and duplicate detection live in a before hook,
  // so the palette and the batch path share one decision instead of each checking its own thing.
  function fetchHookRules() {
    try {
      fetch('/turnstile/hooks', { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j && Array.isArray(j.rules)) { ds.hookRules = j.rules; ds.hookRuleSource = j.source || ''; } })
        .catch(() => {});
    } catch (e) {}
  }
  function ensureHooks() {
    const HK = window.TurnstileHooks;
    if (!HK || ds.hooks) return ds.hooks;
    if (!HK) return null;
    ds.hooks = HK.createHooks();
    HK.on(ds.hooks, 'beforeEnqueue', (cmd) => {
      if (!cmd) return true;
      // The host owns the rules; the page only evaluates them against the pending command.
      const R = window.TurnstileHookRules;
      if (R && !ds.hookRules) ds.hookRules = R.DEFAULT_RULES.slice();
      if (R && ds.hookRules && ds.hookRules.length) {
        const verdict = R.evaluateRules(ds.hookRules, cmd, { queue: ds.operations });
        return verdict.allowed ? true : verdict.reason;
      }
      if (ds.operations.length >= 100) return '一次最多生成 100 条命令。';
      return true;
    });
    return ds.hooks;
  }
  function enqueue(op) {
    const HK = window.TurnstileHooks;
    const hooks = ensureHooks();
    if (HK && hooks) {
      const verdict = HK.runBefore(hooks, 'beforeEnqueue', op);
      if (!verdict.allowed) { ds.error = verdict.reason; render(); return false; }
    }
    mutate(() => ds.operations.push(op));
    if (HK && hooks) HK.runAfter(hooks, 'afterEnqueue', op);
    return true;
  }
  // The rest of the properties pane, declared rather than hand-written (lib/field-schema.js).
  function identityDecls() {
    const FS = window.TurnstileFields;
    if (!FS) return null;
    return [
      FS.field({ key: 'name', label: '名称', group: 'Identity / 标识' }),
      FS.field({ key: 'version', label: '版本', group: 'Identity / 标识' }),
      FS.field({ key: 'row', label: '行 ID', group: 'Identity / 标识' }),
      FS.field({ key: 'ui', label: 'UI 面', group: 'Identity / 标识' }),
    ];
  }
  function sourceDecls() {
    const FS = window.TurnstileFields;
    if (!FS) return null;
    return [
      FS.field({ key: 'manifest', label: 'manifest', group: 'Source / 来源' }),
      FS.field({ key: 'source', label: '源码位置', group: 'Source / 来源' }),
    ];
  }
  function readonlyValues(p) {
    const src = p && p.source ? p.source.file + ':' + (p.source.line || 1) : '';
    return { name: p ? p.name : '', version: (p && p.version) || '未安装', row: (p && p.row) || '无',
      ui: p && p.ui && p.ui.length ? p.ui.join(', ') : '无', manifest: (p && p.manifest) || '无', source: src || '无' };
  }
  function readonlyGroup(fields, values) {
    const dl = node('dl', {});
    for (const f of fields || []) dl.append(node('div', { class: 'prop', 'data-testid': 'prop-' + f.key }, [node('dt', { text: f.label }), node('dd', { text: String(values[f.key] === undefined ? '—' : values[f.key]) })]));
    return dl;
  }
  function paletteButton(label, fn, id) { return btn(label, fn, id, 'btn'); }
  function renderPalette() {
    const box = node('div', { class: 'designer-palette' });
    ['Common', 'Layout', 'Inspect', 'Output'].forEach((name) => box.append(btn(name, () => { ds.palette = name; render(); }, 'palette-' + name, 'tab' + (ds.palette === name ? ' active' : ''))));
    const p = selected(); const eff = p ? effective(p) : { disabled: false, anchor: '' };
    if (ds.palette === 'Common') {
      box.append(paletteButton(eff.disabled ? '启用插件' : '停用插件', () => addOperation({ type: 'toggle', disable: !eff.disabled }), 'designer-add-toggle'));
      box.append(paletteButton('写入位置', () => addAnchor(ds.anchorDraft || eff.anchor), 'designer-add-anchor'));
      box.append(paletteButton('清除位置', () => addAnchor(''), 'designer-clear-anchor'));
      box.append(paletteButton('批量停用已选', () => applyBatchToQueue(true), 'designer-batch-disable'));
      box.append(paletteButton('批量启用已选', () => applyBatchToQueue(false), 'designer-batch-enable'));
    } else if (ds.palette === 'Layout') {
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach((anchor) => box.append(paletteButton(anchor, () => addAnchor(anchor), 'align-' + anchor)));
      box.append(paletteButton('共享面四角分散', spreadSurface, 'align-spread'));
    } else if (ds.palette === 'Inspect') {
      box.append(paletteButton('生成并检查队列', () => { ds.previewKey = ''; ensurePreview(); }, 'designer-validate'));
      box.append(paletteButton('定位深层架构', () => { if (p) locate(p.architectureId); }, 'designer-locate'));
      box.append(paletteButton('重新读取快照', load, 'designer-reload'));
    } else {
      box.append(paletteButton('复制当前输出', () => copyText(generatedCode()), 'designer-copy'));
      box.append(paletteButton('下载当前输出', downloadCode, 'designer-download'));
      box.append(paletteButton('导出命令 JSON', () => { ds.editor = 'json'; render(); }, 'designer-json'));
    }
    return box;
  }
  function renderQueue() {
    const box = node('div', { class: 'command-list', 'data-testid': 'command-queue' });
    if (!ds.operations.length) { box.append(node('div', { class: 'queue-empty', text: '命令队列为空。从上方组件面板或右侧“动作”加入。' })); return box; }
    ds.operations.forEach((op, i) => {
      const line = node('div', { class: 'command-row' + (ds.selectedOp === i ? ' active' : ''), 'data-testid': 'command-' + i });
      line.append(btn(String(i + 1), () => { ds.selectedOp = i; render(); }, 'select-command-' + i, 'icon-btn'), node('code', { text: opLabel(op) }));
      line.append(btn('↑', () => { if (i > 0) mutate(() => { [ds.operations[i - 1], ds.operations[i]] = [ds.operations[i], ds.operations[i - 1]]; ds.selectedOp = i - 1; }); }, 'command-up-' + i, 'icon-btn'));
      line.append(btn('↓', () => { if (i < ds.operations.length - 1) mutate(() => { [ds.operations[i + 1], ds.operations[i]] = [ds.operations[i], ds.operations[i + 1]]; ds.selectedOp = i + 1; }); }, 'command-down-' + i, 'icon-btn'));
      line.append(btn('⧉', () => mutate(() => ds.operations.splice(i + 1, 0, copy(op))), 'command-copy-' + i, 'icon-btn'));
      line.append(btn('×', () => mutate(() => ds.operations.splice(i, 1)), 'command-delete-' + i, 'icon-btn'));
      box.append(line);
    });
    return box;
  }
  function renderStage() {
    const stage = node('section', { class: 'designer-stage' });
    const tabs = node('div', { class: 'stage-head' });
    [['designer', 'Designer'], ['yaml', 'Patch YAML'], ['json', 'JSON'], ['cli', 'CLI'], ['diff', 'Diff']].forEach(([id, label]) => tabs.append(btn(label, () => { ds.editor = id; render(); }, 'editor-' + id, 'tab' + (ds.editor === id ? ' active' : ''))));
    stage.append(tabs);
    if (ds.editor !== 'designer') { stage.append(node('pre', { class: 'generated', 'data-testid': 'generated-code', text: generatedCode() })); return stage; }
    const p = selected();
    if (!p) { stage.append(empty('没有可设计的插件。')); return stage; }
    const eff = effective(p);
    stage.append(node('div', { class: 'designer-summary' }, [
      node('div', { class: 'designer-card' }, [node('span', { text: 'Name / 插件' }), node('strong', { text: p.name })]),
      node('div', { class: 'designer-card' }, [node('span', { text: 'Class / 配置行' }), node('strong', { text: p.row || '无' })]),
      node('div', { class: 'designer-card' }, [node('span', { text: '生成后状态 / 位置' }), node('strong', { text: (eff.disabled ? '停用' : '启用') + ' · ' + (eff.anchor || '未设置') })]),
    ]));
    stage.append(renderQueue());
    if (ds.error) stage.append(node('div', { class: 'designer-error', 'data-testid': 'designer-error', text: ds.error }));
    stage.append(node('div', { class: 'designer-status', text: (ds.busy ? '正在生成…' : ds.preview?.changed ? '已生成：预览有变化，确认后才写入。' : '生成结果与当前文件一致。') + ' 撤销 ' + ds.past.length + ' · 重做 ' + ds.future.length }));
    return stage;
  }
  function renderDialog() {
    document.querySelectorAll('.designer-dialog').forEach((n) => n.remove());
    if (!ds.dialog || !ds.preview) return;
    const confirm = btn('确认整批写入', applyDesigner, 'designer-confirm', 'btn danger'); confirm.disabled = ds.busy || !ds.preview.changed;
    const overlay = node('div', { class: 'designer-dialog', 'data-testid': 'designer-dialog' });
    overlay.append(node('section', { class: 'patch-card' }, [
      node('h2', { text: '生成结果 · ' + ds.operations.length + ' 条命令' }),
      node('div', { class: 'hint', text: '整批一次写入、最多一个备份；若文件在预览后被外部修改，将拒绝覆盖。' }),
      node('div', { class: 'patch-diff' }, [node('pre', { text: ds.preview.before || '(空文件)' }), node('pre', { 'data-testid': 'designer-after', text: ds.preview.after })]),
      node('div', { class: 'patch-actions' }, [btn('取消', () => { ds.dialog = false; render(); }, 'designer-cancel'), confirm]),
    ]));
    document.body.append(overlay);
  }
  async function applyDesigner() {
    if (!ds.preview || ds.busy) return;
    ds.busy = true;
    try {
      await designerRequest(false);
      ds.operations = []; ds.past = []; ds.future = []; ds.saved = '[]'; ds.preview = null; ds.previewKey = ''; ds.dialog = false; persist();
      try { localStorage.setItem('turnstile.designer.savepoint.' + state.data.profile.name, '[]'); } catch {}
      state.notice = '整批配置已写入并保留备份；重启 mini 后生效。'; ds.busy = false; await load();
    } catch (error) {
      ds.busy = false; ds.dialog = false; ds.error = error.status === 409 ? '文件已被外部修改；已拒绝覆盖，请重新生成。' : error.message; render();
    }
  }
  function designer() {
    loadDraft();
    if (!selected()) ds.package = state.data.plugins[0]?.name || '';
    const main = $('main'); main.append(pageHead('插件配置设计器', '对象树 + 分类命令 + 属性/动作 + 多目标代码生成；所有修改先进入命令队列。'));
    if (state.notice) main.append(node('div', { class: 'notice', text: state.notice }));
    if (ds.error) main.append(node('div', { class: 'designer-error', 'data-testid': 'designer-error', text: ds.error }));
    const undoBtn = btn('↶ 撤销', undo, 'designer-undo'), redoBtn = btn('↷ 重做', redo, 'designer-redo');
    undoBtn.disabled = !ds.past.length; redoBtn.disabled = !ds.future.length;
    const generate = btn('生成 / 预览', () => { if (ds.previewKey === currentKey() && ds.preview) { ds.dialog = true; render(); } }, 'designer-generate');
    generate.disabled = !ds.operations.length || ds.busy || ds.previewKey !== currentKey() || !ds.preview || Boolean(ds.error);
    main.append(node('div', { class: 'designer-toolbar' }, [undoBtn, redoBtn, btn('保存草稿', savePoint, 'designer-save'), generate, node('span', { class: dirty() ? 'dirty' : 'hint', 'data-testid': 'designer-dirty', text: dirty() ? '● 相对保存点有修改' : '保存点' })]));
    main.append(renderPalette());
    main.append(renderTimeline());
    const tree = node('aside', { class: 'object-tree' }, [node('div', { class: 'object-head', text: 'Object Tree / 对象树' }), node('div', { class: 'tree-root', text: '▾ ' + state.data.profile.name + ' : Profile' })]);
    const plugins = state.data.plugins.filter(matches);
    plugins.forEach((p) => { const item = btn('', () => selectDesignerPlugin(p), 'tree-' + p.name, 'tree-item' + (p.name === ds.package ? ' active' : '')); item.append(document.createTextNode((ds.operations.some((op) => op.package === p.name) ? '◆ ' : '  ') + p.name), node('span', { class: 'tree-state', text: effective(p).disabled ? 'off' : 'on' })); tree.append(item); });
    if (!plugins.length) tree.append(empty('没有匹配对象。'));
    main.append(node('div', { class: 'designer-grid' }, [tree, renderStage()]));
    setStatus(ds.operations.length, ds.operations.length); ensurePreview(); renderDialog();
  }
  function groupedInspector(title, id, content) {
    const box = node('section', { class: 'prop-group' });
    box.append(btn((ds.groups[id] ? '▾ ' : '▸ ') + title, () => { ds.groups[id] = !ds.groups[id]; renderInspector(); }, 'group-' + id, 'prop-collapse'));
    if (ds.groups[id]) box.append(content); return box;
  }
  function designerInspector(box, p) {
    const properties = btn('属性', () => { ds.inspector = 'properties'; renderInspector(); }, 'designer-properties', 'tab' + (ds.inspector === 'properties' ? ' active' : ''));
    const actions = btn('动作 / 事件', () => { ds.inspector = 'actions'; renderInspector(); }, 'designer-actions', 'tab' + (ds.inspector === 'actions' ? ' active' : ''));
    box.append(node('div', { class: 'tabs' }, [properties, actions]));
    if (ds.inspector === 'actions') {
      const eff = effective(p); const stack = node('div', { class: 'action-stack' });
      [['onToggle', eff.disabled ? '启用插件' : '停用插件', () => addOperation({ type: 'toggle', disable: !eff.disabled }), 'event-toggle'], ['onAnchorChange', '写入位置', () => addAnchor(ds.anchorDraft || eff.anchor), 'event-anchor'], ['onClearAnchor', '清除位置', () => addAnchor(''), 'event-clear']].forEach(([name, label, fn, id]) => stack.append(node('div', { class: 'event-row' }, [node('code', { text: name }), btn('＋ ' + label, fn, id)])));
      stack.append(btn('在深层架构中定位', () => locate(p.architectureId), 'designer-action-locate'));
      box.append(stack); return;
    }
    const eff = effective(p);
    const ro = readonlyValues(p);
    box.append(groupedInspector('Identity / 标识', 'identity', readonlyGroup(identityDecls(), ro)));
    const config = node('div', {});
    // The checkbox is what the declaration says it is: controlSpec decides kind and initial value.
    const FSx = window.TurnstileFields;
    const declList = configFields() || [];
    const specFor = (key) => (FSx ? FSx.controlSpec(declList.find((f) => f.key === key), configValues(p)[key]) : null);
    const disabledSpec = specFor('disabled');
    const check = node('input', { type: disabledSpec ? disabledSpec.kind : 'checkbox', 'data-testid': 'property-disabled', 'data-field-kind': disabledSpec ? disabledSpec.kind : 'checkbox', onchange: (e) => addOperation({ type: 'toggle', disable: e.target.checked }) }); check.checked = disabledSpec ? disabledSpec.value : eff.disabled;
    config.append(node('label', { class: 'property-check' }, [check, document.createTextNode('disabled / 停用')]));
    const errBox = node('p', { class: 'hint', 'data-testid': 'field-error-anchor', text: '' });
    const refreshAnchorError = () => {
      const decl = configFields();
      const list = decl ? window.TurnstileFields.validateValues(decl, { disabled: false, anchor: ds.anchorDraft }) : [];
      const hit = list.find((e) => e.key === 'anchor');
      errBox.textContent = hit ? hit.message : '';
      if (hit) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    const anchorSpec = specFor('anchor');
    const input = node('input', { class: 'property-input', 'data-testid': 'property-anchor', 'data-field-kind': anchorSpec ? anchorSpec.kind : 'text', value: anchorSpec ? anchorSpec.value : ds.anchorDraft, placeholder: 'anchor token', oninput: (e) => { ds.anchorDraft = e.target.value; refreshAnchorError(); } });
    const declared = configFields();
    const errs = declared ? window.TurnstileFields.validateValues(declared, configValues(p)) : [];
    const anchorErr = errs.find((e) => e.key === 'anchor');
    if (anchorErr) input.setAttribute('aria-invalid', 'true');
    config.append(node('div', { class: 'prop' }, [node('dt', { text: 'anchor' }), node('dd', {}, [input])]));
    if (anchorErr) errBox.textContent = anchorErr.message;
    config.append(errBox);
    config.append(node('div', { class: 'action-stack' }, [btn('＋ 加入位置命令', () => addAnchor(ds.anchorDraft), 'property-add-anchor'), btn('＋ 清除位置', () => addAnchor(''), 'property-clear-anchor')]));
    box.append(groupedInspector('Config / 可编辑属性', 'config', config));
    box.append(groupedInspector('Source / 来源', 'source', readonlyGroup(sourceDecls(), ro)));
  }
  const originalInspector = renderInspector;
  renderInspector = function () {
    const p = state.view === 'designer' ? selected() : null;
    if (!p) { originalInspector(); return; }
    const box = $('inspector'); box.replaceChildren(node('h2', { text: 'Object Properties' }), node('p', { class: 'mono', text: p.name })); designerInspector(box, p);
  };
  const originalKeydown = null;
  document.addEventListener('keydown', (event) => {
    if (state.view !== 'designer') return;
    if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); savePoint(); }
    if (event.key === 'Escape' && ds.dialog) { ds.dialog = false; render(); }
  });
  window.designer = designer;
})();
