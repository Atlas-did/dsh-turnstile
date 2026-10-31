'use strict';
// 页面渲染器：把 page JSON 变成 DOM。搭建器画布与「宿主内页面」共用同一份，避免两套渲染。
// 只做只读渲染（不绑拖拽），样式来自 node.style。
(function () {
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function styleOf(node) {
    const s = node.style || {};
    const out = {};
    if (s.padding) out.padding = s.padding + 'px';
    if (s.align && s.align !== 'left') out.textAlign = s.align;
    if (s.tone === 'panel') { out.background = '#16212b'; out.border = '1px solid #2b3a49'; out.borderRadius = '8px'; }
    if (s.tone === 'accent') { out.background = '#1c2f45'; out.border = '1px solid #3b6ea8'; out.borderRadius = '8px'; }
    if (s.width === 'half') out.width = '50%';
    if (s.width === 'full') out.width = '100%';
    return out;
  }
  function rows(text) {
    return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(',').map((c) => c.trim()));
  }
  function series(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = /^(.*?)[:：]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(line.trim());
      if (m) out.push({ label: m[1].trim(), value: Number(m[2]) });
    }
    return out;
  }
  function chartNode(p) {
    const wrap = el('div');
    wrap.style.display = 'grid'; wrap.style.gap = '6px';
    if (p.title) { const t = el('div'); t.textContent = p.title; t.style.fontWeight = '600'; wrap.append(t); }
    const data = series(p.series);
    if (!data.length) { const n = el('div'); n.textContent = '（没有可解析的数据：每行写 标签:数值）'; n.style.color = '#8fa3b5'; wrap.append(n); return wrap; }
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
    for (const d of data) {
      const row = el('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
      const label = el('span'); label.textContent = d.label; label.style.width = '34%'; label.style.color = '#b9c7d4'; label.style.fontSize = '11px';
      const track = el('span'); track.style.flex = '1'; track.style.height = '10px'; track.style.background = '#1a2531'; track.style.borderRadius = '5px'; track.style.overflow = 'hidden';
      const bar = el('span'); bar.style.display = 'block'; bar.style.height = '100%'; bar.style.width = Math.round((Math.abs(d.value) / max) * 100) + '%'; bar.style.background = p.kind === 'line' ? '#69b7ff' : '#4ec97c';
      track.append(bar);
      const val = el('span'); val.textContent = String(d.value); val.style.fontSize = '11px'; val.style.color = '#8fa3b5';
      row.append(label, track, val); wrap.append(row);
    }
    return wrap;
  }
  function tableNode(p) {
    const t = el('table'); t.style.width = '100%'; t.style.borderCollapse = 'collapse'; t.style.fontSize = '12px';
    const head = el('tr');
    for (const c of String(p.columns || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const th = el('th'); th.textContent = c; th.style.textAlign = 'left'; th.style.padding = '4px 6px'; th.style.borderBottom = '1px solid #2b3a49'; th.style.color = '#8fa3b5'; head.append(th);
    }
    const thead = el('thead'); thead.append(head); t.append(thead);
    const tbody = el('tbody');
    for (const r of rows(p.rows)) { const tr = el('tr'); for (const c of r) { const td = el('td'); td.textContent = c; td.style.padding = '4px 6px'; td.style.borderBottom = '1px solid #1c2836'; tr.append(td); } tbody.append(tr); }
    t.append(tbody); return t;
  }
  // renderBody 只产内容（不带子节点包装），供搭建器在外层套自己的可选中/可放置包装。
  function renderBody(node) {
    const p = node.props || {};
    const box = el('div'); box.dataset.nodeId = node.id; box.dataset.nodeType = node.type;
    Object.assign(box.style, styleOf(node));
    if (node.type === 'heading') { const n = el('div'); n.className = 'heading'; n.style.fontSize = ({ 1: '22px', 2: '18px', 3: '15px' })[p.level] || '18px'; n.style.fontWeight = '700'; n.textContent = p.text; box.append(n); }
    else if (node.type === 'text') { const n = el('div'); n.className = 'text'; n.style.color = '#b9c7d4'; n.textContent = p.text; box.append(n); }
    else if (node.type === 'panel') { const n = el('div'); n.style.padding = (p.padding || 0) + 'px'; const t = el('div'); t.textContent = p.title || ''; t.style.fontWeight = '600'; t.style.marginBottom = '6px'; n.append(t, children(node)); box.append(n); }
    else if (node.type === 'stat') { const n = el('div'); n.className = 'stat ' + (p.tone || 'neutral'); n.style.background = '#16212b'; n.style.border = '1px solid #2b3a49'; n.style.borderRadius = '8px'; n.style.padding = '10px 12px'; const v = el('b'); v.textContent = p.value; v.style.fontSize = '20px'; v.style.display = 'block'; v.style.color = p.tone === 'good' ? '#4ec97c' : p.tone === 'warn' ? '#e8b53d' : p.tone === 'bad' ? '#e86161' : '#e6edf5'; const l = el('small'); l.textContent = p.label; l.style.color = '#8fa3b5'; n.append(v, l); box.append(n); }
    else if (node.type === 'table') { box.append(tableNode(p)); }
    else if (node.type === 'chart') { box.append(chartNode(p)); }
    else if (node.type === 'image') {
      const src = String(p.src || '');
      if (!/^(https?:\/\/|\/turnstile\/)/.test(src)) { const n = el('div'); n.textContent = '图片只允许 http(s) 或 /turnstile/ 地址'; n.style.color = '#e3b341'; box.append(n); }
      else { const img = el('img'); img.src = src; img.alt = p.alt || ''; img.style.maxWidth = '100%'; box.append(img); }
    }
    return box;
  }

  function renderNode(node) {
    const box = renderBody(node);
    if (node.type === 'panel') {
      const host = el('div');
      Object.assign(host.style, styleOf(node));
      host.dataset.nodeId = node.id; host.dataset.nodeType = node.type;
      host.style.padding = ((node.props && node.props.padding) || 0) + 'px';
      const t = el('div'); t.textContent = (node.props && node.props.title) || ''; t.style.fontWeight = '600'; t.style.marginBottom = '6px';
      box.replaceChildren();
      host.append(t, children(node));
      return host;
    }
    if (node.type === 'stack' || node.type === 'grid') {
      box.replaceChildren(children(node));
    }
    return box;
  }
  function children(node) {
    const wrap = el('div');
    if (node.type === 'grid') { wrap.style.display = 'grid'; wrap.style.gridTemplateColumns = 'repeat(' + (node.props.columns || 2) + ', minmax(0,1fr))'; }
    else if (node.props && node.props.direction === 'row') { wrap.style.display = 'flex'; wrap.style.flexWrap = 'wrap'; }
    else { wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; }
    wrap.style.gap = ((node.props && node.props.gap) || 0) + 'px';
    for (const c of node.children || []) wrap.append(renderNode(c));
    return wrap;
  }
  window.TurnstilePageRender = { render: renderNode, renderBody, renderChildren: children, styleOf, chartData: series, tableRows: rows };
})();
