/* Review sidebar: local-only notes anchored to a console object or selected text. */
(function () {
  const model = window.TurnstileAnnotations;
  if (!model) return;

  const style = document.createElement('style');
  style.textContent = `
.annotation-toggle .annotation-count{display:inline-block;min-width:16px;margin-left:4px;padding:0 4px;border-radius:8px;background:#82c7ff18;color:var(--blue);font:10px var(--mono)}
.annotation-drawer[hidden],.annotation-backdrop[hidden],.annotation-selection[hidden]{display:none!important}
.annotation-backdrop{position:fixed;inset:58px 0 28px;z-index:69;background:#03070a66;backdrop-filter:blur(1px)}
.annotation-drawer{position:fixed;z-index:70;top:58px;right:0;bottom:28px;width:min(380px,94vw);display:flex;flex-direction:column;background:var(--nav);border-left:1px solid var(--line);box-shadow:-18px 0 48px #0007;color:var(--text)}
.annotation-head{display:flex;align-items:center;gap:8px;padding:14px 14px 10px;border-bottom:1px solid var(--line)}.annotation-head h2{margin:0;font-size:15px}.annotation-head .spacer{flex:1}.annotation-body{min-height:0;overflow:auto;padding:12px 14px 24px}.annotation-intro{margin:0 0 12px;color:var(--muted);font-size:11px;line-height:1.65}.annotation-tools{display:flex;gap:7px;margin-bottom:12px}.annotation-tools .select{min-width:0;flex:1}.annotation-form{padding:12px;border:1px solid #82c7ff44;border-radius:9px;background:#82c7ff08;margin-bottom:14px}.annotation-form label{display:block;color:var(--muted);font-size:11px;margin:8px 0 4px}.annotation-form textarea{width:100%;min-height:104px;resize:vertical;border:1px solid var(--line);border-radius:7px;background:#0a1118;color:var(--text);padding:9px;font:inherit}.annotation-form textarea:focus{border-color:var(--blue);outline:2px solid #82c7ff18}.annotation-context{padding:7px 9px;border-radius:6px;background:#0a1118;color:var(--blue);font:11px var(--mono);word-break:break-word}.annotation-quote{margin:8px 0;padding:7px 9px;border-left:2px solid var(--amber);background:#e8bc6709;color:var(--muted);font-size:11px;white-space:pre-wrap;word-break:break-word}.annotation-error{padding:8px 10px;margin-bottom:10px;border:1px solid var(--red);border-radius:7px;color:var(--red);font-size:11px}.annotation-list{display:grid;gap:9px}.annotation-card{border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:11px}.annotation-card.resolved{opacity:.68}.annotation-meta{display:flex;align-items:center;gap:6px;margin-bottom:7px}.annotation-meta time{margin-left:auto;color:var(--muted);font:10px var(--mono)}.annotation-target{color:var(--blue);font-size:11px;margin-bottom:6px}.annotation-text{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.6}.annotation-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.annotation-actions .btn{min-height:28px;padding:3px 8px;font-size:11px}.annotation-empty{padding:28px 12px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:9px}.annotation-selection{position:fixed;z-index:68;box-shadow:0 8px 28px #0008;border-color:#82c7ff66}.annotation-foot{margin-top:12px;color:var(--muted);font-size:10px;line-height:1.6}
@media(max-width:680px){.annotation-backdrop{inset:0}.annotation-drawer{top:0;bottom:0;width:100%;max-width:none}.annotation-toggle{font-size:0}.annotation-toggle:first-letter{font-size:13px}.annotation-toggle .annotation-count{font-size:10px}}
`;
  document.head.append(style);

  const astate = state.annotations = { open: false, notes: [], filter: 'open', draft: null, deleteId: null, profile: '', message: '' };
  const toggle = btn('✎ 批注', () => setAnnotationsOpen(!astate.open), 'annotations-toggle', 'btn annotation-toggle');
  toggle.title = '打开批注侧栏 (Ctrl+Shift+A)';
  toggle.setAttribute('aria-expanded', 'false');
  $('details').before(toggle);

  const backdrop = node('div', { class: 'annotation-backdrop', 'data-testid': 'annotations-backdrop', hidden: 'hidden', onclick: () => setAnnotationsOpen(false) });
  const drawer = node('aside', { class: 'annotation-drawer', 'data-testid': 'annotations-drawer', 'aria-label': '批注侧栏', hidden: 'hidden' });
  document.body.append(backdrop, drawer);
  const selectionButton = btn('✎ 批注所选内容', () => {
    const quote = astate.selection || '';
    selectionButton.hidden = true;
    startAnnotation(quote);
  }, 'annotation-selection', 'btn annotation-selection');
  selectionButton.hidden = true;
  selectionButton.addEventListener('mousedown', (e) => e.preventDefault());
  document.body.append(selectionButton);

  function storageKey() { return 'turnstile.console.annotations.' + (state.data?.profile?.name || 'default'); }
  function loadAnnotations(force) {
    const profile = state.data?.profile?.name || 'default';
    if (!force && astate.profile === profile) return;
    astate.profile = profile;
    try { astate.notes = model.normalizeAnnotations(JSON.parse(localStorage.getItem(storageKey()) || '[]')); }
    catch { astate.notes = []; astate.message = '本地批注读取失败；已显示为空，原数据没有被改写。'; }
  }
  function saveAnnotations() {
    try { localStorage.setItem(storageKey(), JSON.stringify(astate.notes)); astate.message = ''; }
    catch { astate.message = '浏览器无法保存批注。请先导出 Markdown，避免刷新后丢失。'; }
  }
  function setAnnotationsOpen(open) {
    astate.open = Boolean(open);
    if (astate.open) loadAnnotations();
    if (!astate.open) { astate.draft = null; astate.deleteId = null; selectionButton.hidden = true; }
    renderAnnotations();
  }
  function currentTarget() {
    const s = state.selected;
    if (s) return { view: state.view, kind: s.kind || 'object', id: s.plugin?.name || s.title || '', title: s.title || '当前对象', archId: s.archId || '' };
    if (state.view === 'architecture') {
      const n = state.data?.architecture?.nodes?.find((x) => x.id === state.archId);
      if (n) return { view: 'architecture', kind: n.kind, id: n.id, title: n.label, archId: n.id };
    }
    return { view: state.view, kind: 'page', id: state.view, title: ({ overview: '控制台总览', steward: '环境管家', designer: '配置设计器', checks: '门禁检查', plugins: '插件', surfaces: 'UI 占用', architecture: '深层架构', history: '历史', launcher: '启动器', skeleton: '插件检查' })[state.view] || state.view, archId: '' };
  }
  function startAnnotation(quote) {
    loadAnnotations();
    astate.open = true;
    astate.draft = { kind: 'question', quote: String(quote || '').slice(0, 1000), target: currentTarget() };
    astate.deleteId = null;
    renderAnnotations();
    setTimeout(() => document.querySelector('[data-testid="annotation-text"]')?.focus(), 0);
  }
  function saveDraft() {
    const draft = astate.draft;
    const area = document.querySelector('[data-testid="annotation-text"]');
    if (!draft || !area) return;
    try {
      const now = new Date().toISOString();
      const note = model.createAnnotation({ id: crypto.randomUUID(), kind: draft.kind, text: area.value, quote: draft.quote, target: draft.target, now });
      astate.notes.unshift(note);
      astate.draft = null;
      astate.filter = 'open';
      saveAnnotations();
      renderAnnotations();
    } catch (e) { astate.message = e.message; renderAnnotations(); }
  }
  function updateNote(id, patch) {
    const index = astate.notes.findIndex((n) => n.id === id);
    if (index < 0) return;
    const old = astate.notes[index];
    astate.notes[index] = model.createAnnotation({ ...old, ...patch, createdAt: old.createdAt, now: new Date().toISOString() });
    astate.deleteId = null;
    saveAnnotations();
    renderAnnotations();
  }
  function removeNote(id) {
    if (astate.deleteId !== id) { astate.deleteId = id; renderAnnotations(); return; }
    astate.notes = astate.notes.filter((n) => n.id !== id);
    astate.deleteId = null;
    saveAnnotations();
    renderAnnotations();
  }
  function locateAnnotation(note) {
    const t = note.target;
    setAnnotationsOpen(false);
    if (t.archId && state.data.architecture.nodes.some((n) => n.id === t.archId)) { locate(t.archId); return; }
    state.view = t.view || 'overview';
    state.query = '';
    $('global-search').value = '';
    state.selected = null;
    if (t.kind === 'plugin') {
      const p = state.data.plugins.find((x) => x.name === t.id);
      if (p) state.selected = selectionForPlugin(p);
    } else if (t.kind === 'surface') {
      const s = state.data.surfaces.find((x) => x.surface === t.id);
      if (s) state.selected = { title: s.surface, kind: 'surface', properties: { UI面: s.surface, 插件数: s.count, 插件: s.plugins.map((p) => p.name).join(', ') }, archId: s.plugins[0]?.architectureId };
    } else if (t.kind === 'check') {
      const c = state.data.report?.checks?.find((x) => x.name === t.id);
      if (c) state.selected = { title: c.name, kind: 'check', properties: { 检查: c.name, 结果: c.ok ? '通过' : '需检查', 耗时: (c.ms ?? '未记录') + ' ms', 发现数: (c.findings || []).length }, findings: c.findings || [] };
    }
    persistView();
    render();
  }
  function exportAnnotations() {
    loadAnnotations();
    const blob = new Blob([model.annotationsMarkdown(astate.notes, { profile: astate.profile })], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = node('a', { href: url, download: 'turnstile-' + astate.profile + '-annotations.md' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    astate.message = '已导出 Markdown，可直接交给智能体继续处理。';
    renderAnnotations();
  }
  function annotationForm() {
    const draft = astate.draft;
    const kind = node('select', { class: 'select', 'data-testid': 'annotation-kind', onchange: (e) => { draft.kind = e.target.value; } }, [['question', '疑问'], ['issue', '问题'], ['decision', '决定'], ['note', '备注']].map(([v, t]) => node('option', { value: v, text: t, selected: draft.kind === v ? 'selected' : null })));
    const form = node('section', { class: 'annotation-form', 'data-testid': 'annotation-form' });
    form.append(node('div', { class: 'annotation-context', text: draft.target.title + ' · ' + draft.target.view }));
    if (draft.quote) form.append(node('blockquote', { class: 'annotation-quote', 'data-testid': 'annotation-quote', text: draft.quote }));
    form.append(node('label', { text: '类型', for: 'annotation-kind' }), kind);
    form.append(node('label', { text: '批注内容', for: 'annotation-text' }));
    const area = node('textarea', { id: 'annotation-text', 'data-testid': 'annotation-text', maxlength: '4000', placeholder: '例如：这里的“检查通过”是否包含运行态？需要补什么证据？' });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(); } });
    form.append(area, node('div', { class: 'annotation-actions' }, [btn('保存批注', saveDraft, 'annotation-save'), btn('取消', () => { astate.draft = null; renderAnnotations(); }, 'annotation-cancel')]));
    return form;
  }
  function annotationCard(note) {
    const labels = { question: '疑问', issue: '问题', decision: '决定', note: '备注' };
    const card = node('article', { class: 'annotation-card' + (note.status === 'resolved' ? ' resolved' : ''), 'data-testid': 'annotation-' + note.id });
    card.append(node('div', { class: 'annotation-meta' }, [chip(labels[note.kind], note.kind === 'issue' ? 'bad' : note.kind === 'question' ? 'warn' : 'blue'), chip(note.status === 'resolved' ? '已解决' : '待处理', note.status === 'resolved' ? 'good' : ''), node('time', { text: new Date(note.createdAt).toLocaleDateString() })]));
    card.append(node('div', { class: 'annotation-target', text: note.target.title + ' · ' + note.target.view }));
    if (note.quote) card.append(node('blockquote', { class: 'annotation-quote', text: note.quote }));
    card.append(node('p', { class: 'annotation-text', text: note.text }));
    const removing = astate.deleteId === note.id;
    card.append(node('div', { class: 'annotation-actions' }, [btn('定位', () => locateAnnotation(note), 'annotation-locate-' + note.id), btn(note.status === 'resolved' ? '重新打开' : '标为已解决', () => updateNote(note.id, { status: note.status === 'resolved' ? 'open' : 'resolved' }), 'annotation-resolve-' + note.id), btn(removing ? '确认删除' : '删除', () => removeNote(note.id), 'annotation-delete-' + note.id, 'btn' + (removing ? ' danger' : ''))]));
    return card;
  }
  function renderAnnotations() {
    backdrop.hidden = !astate.open;
    drawer.hidden = !astate.open;
    toggle.setAttribute('aria-expanded', String(astate.open));
    const counts = model.annotationCounts(astate.notes);
    toggle.replaceChildren(document.createTextNode('✎ 批注'), node('span', { class: 'annotation-count', 'data-testid': 'annotation-count', text: String(counts.open) }));
    if (!astate.open) return;
    const head = node('div', { class: 'annotation-head' }, [node('h2', { text: '批注' }), chip(counts.open + ' 待处理', counts.open ? 'warn' : 'good'), node('span', { class: 'spacer' }), btn('导出', exportAnnotations, 'annotations-export'), btn('×', () => setAnnotationsOpen(false), 'annotations-close', 'icon-btn')]);
    const body = node('div', { class: 'annotation-body' });
    body.append(node('p', { class: 'annotation-intro', text: '记录疑问、问题或决定。批注只保存在此浏览器的当前 profile 下，不改插件文件；导出 Markdown 后可交给智能体继续处理。' }));
    if (astate.message) body.append(node('div', { class: 'annotation-error', 'data-testid': 'annotation-message', text: astate.message }));
    body.append(node('div', { class: 'annotation-tools' }, [btn('＋ 新建批注', () => startAnnotation(''), 'annotation-new'), node('select', { class: 'select', 'data-testid': 'annotation-filter', 'aria-label': '筛选批注', onchange: (e) => { astate.filter = e.target.value; renderAnnotations(); } }, [['open', '待处理 ' + counts.open], ['resolved', '已解决 ' + counts.resolved], ['all', '全部 ' + counts.total]].map(([v, t]) => node('option', { value: v, text: t, selected: astate.filter === v ? 'selected' : null })))]));
    if (astate.draft) body.append(annotationForm());
    const notes = astate.notes.filter((n) => astate.filter === 'all' || n.status === astate.filter);
    body.append(node('div', { class: 'annotation-list', 'data-testid': 'annotation-list' }, notes.length ? notes.map(annotationCard) : [node('div', { class: 'annotation-empty', 'data-testid': 'annotation-empty', text: astate.filter === 'open' && counts.total ? '没有待处理批注。可切换到“全部”查看已解决记录。' : '还没有批注。选中页面文字，或点击“新建批注”记录当前对象。' })]));
    drawer.replaceChildren(head, body);
  }

  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      if (astate.open || e.target.closest('button,input,textarea,select,a,.annotation-drawer')) { selectionButton.hidden = true; return; }
      const selection = window.getSelection();
      const value = String(selection || '').trim();
      if (!value || !selection.rangeCount || !$('main').contains(selection.anchorNode)) { selectionButton.hidden = true; return; }
      astate.selection = value.slice(0, 1000);
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      selectionButton.style.left = Math.max(8, Math.min(innerWidth - 170, rect.left)) + 'px';
      selectionButton.style.top = Math.max(66, Math.min(innerHeight - 50, rect.bottom + 7)) + 'px';
      selectionButton.hidden = false;
    }, 0);
  });
  $('main').addEventListener('scroll', () => { selectionButton.hidden = true; }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setAnnotationsOpen(!astate.open); }
    else if (e.key === 'Escape' && astate.open) { e.preventDefault(); setAnnotationsOpen(false); }
  });
  renderAnnotations();
})();
