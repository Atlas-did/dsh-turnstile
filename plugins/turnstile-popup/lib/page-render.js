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
    if (s.color) out.color = s.color;
    if (s.fontSize) out.fontSize = s.fontSize + 'px';
    if (s.radius) out.borderRadius = s.radius + 'px';
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
    if (p.kind === 'pie') { wrap.append(pieNode(data)); return wrap; }
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
    if (p.kind === 'line') { wrap.append(lineNode(data, max)); return wrap; }
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
  // B3：饼图与带坐标轴的折线，都用内联 SVG（不引第三方库）。
  function pieNode(data) {
    const total = data.reduce((a, d) => a + Math.abs(d.value), 0) || 1;
    const colors = ['#4ec97c', '#69b7ff', '#e8b53d', '#e86161', '#a78bfa', '#3ddad7'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 200'); svg.style.width = '200px'; svg.style.height = '200px';
    let angle = -Math.PI / 2;
    const cx = 100, cy = 100, r = 80;
    data.forEach((d, i) => {
      const frac = Math.abs(d.value) / total;
      const end = angle + frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      const large = frac > 0.5 ? 1 : 0;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + cx + ' ' + cy + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z');
      path.setAttribute('fill', colors[i % colors.length]);
      svg.append(path);
      angle = end;
    });
    const box = el('div'); box.style.display = 'flex'; box.style.gap = '12px'; box.style.alignItems = 'center';
    const legend = el('div'); legend.style.display = 'grid'; legend.style.gap = '3px'; legend.style.fontSize = '11px';
    data.forEach((d, i) => {
      const row = el('div'); row.style.display = 'flex'; row.style.gap = '6px'; row.style.alignItems = 'center';
      const dot = el('span'); dot.style.width = '8px'; dot.style.height = '8px'; dot.style.borderRadius = '2px'; dot.style.background = colors[i % colors.length];
      const t = el('span'); t.textContent = d.label + ' · ' + d.value; t.style.color = '#b9c7d4';
      row.append(dot, t); legend.append(row);
    });
    box.append(svg, legend);
    return box;
  }

  function lineNode(data, max) {
    const W = 320, H = 120, pad = 24;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.style.width = '100%'; svg.style.height = '140px';
    const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
    const pts = data.map((d, i) => {
      const x = pad + step * i;
      const y = H - pad - (Math.abs(d.value) / max) * (H - pad * 2);
      return [x, y];
    });
    // 坐标轴
    for (const [x1, y1, x2, y2] of [[pad, pad / 2, pad, H - pad], [pad, H - pad, W - pad / 2, H - pad]]) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', '#2b3a49'); svg.append(l);
    }
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', '#69b7ff'); poly.setAttribute('stroke-width', '2');
    svg.append(poly);
    data.forEach((d, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', pts[i][0]); c.setAttribute('cy', pts[i][1]); c.setAttribute('r', '3'); c.setAttribute('fill', '#69b7ff');
      svg.append(c);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', pts[i][0]); t.setAttribute('y', H - 6); t.setAttribute('fill', '#8fa3b5'); t.setAttribute('font-size', '8'); t.setAttribute('text-anchor', 'middle');
      t.textContent = d.label.slice(0, 8);
      svg.append(t);
    });
    return svg;
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
    else if (node.type === 'dataTable' || node.type === 'dataChart') {
      const holder = el('div');
      holder.dataset.bound = node.type;
      holder.dataset.source = p.source || '';
      holder.dataset.kind = p.kind || 'bar';
      holder.textContent = '读取 ' + (p.source || '') + ' …';
      holder.style.color = '#8fa3b5'; holder.style.fontSize = '12px';
      box.append(holder);
      hydrate(holder);
    }
    else if (node.type === 'table') { box.append(tableNode(p)); }
    else if (node.type === 'chart') { box.append(chartNode(p)); }
    else if (node.type === 'image') {
      const raw = String(p.src || '').trim();
      // 三种写法：http(s) 外链、/turnstile/ 站内、asset:<本地绝对路径>（经 /turnstile/asset 白名单）。
      const src = raw.indexOf('asset:') === 0 ? '/turnstile/asset?path=' + encodeURIComponent(raw.slice(6)) : raw;
      if (!/^(https?:\/\/|\/turnstile\/)/.test(src)) { const n = el('div'); n.textContent = '图片地址要写 http(s):// 、/turnstile/… 或 asset:<绝对路径>'; n.style.color = '#e3b341'; box.append(n); }
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
  // B1 数据绑定：组件只声明「我要哪份数据」，渲染时去宿主端点取。
  function hydrate(holder) {
    const source = holder.dataset.source;
    const token = new URLSearchParams(location.search).get('token') || '';
    const url = '/turnstile/' + source + '?token=' + encodeURIComponent(token);
    fetch(url).then((r) => r.json()).then((data) => {
      holder.textContent = '';
      holder.style.color = '';
      if (holder.dataset.bound === 'dataTable') holder.append(tableNode(tableFrom(source, data)));
      else holder.append(chartNode({ kind: holder.dataset.kind, title: source, series: seriesFrom(source, data) }));
    }).catch((e) => { holder.textContent = '读取失败：' + e.message; holder.style.color = '#e3b341'; });
  }
  function tableFrom(source, data) {
    if (source === 'plugins') {
      const rows = (data.rows || []).map((r) => r.name + ', ' + (r.disabled ? '停用' : '启用') + ', ' + ((r.ui || []).length) + ' 个界面');
      return { columns: '插件, 状态, UI 面', rows: rows.join('\n') };
    }
    if (source === 'health') {
      const rows = (data.items || []).map((i) => i.id + ', ' + i.level + ', ' + String(i.message || '').replace(/,/g, ' '));
      return { columns: '检查, 结论, 说明', rows: rows.join('\n') };
    }
    const rows = ((data.surfaces || [])).map((s) => s.surface + ', ' + s.count);
    return { columns: '界面, 插件数', rows: rows.join('\n') };
  }
  function seriesFrom(source, data) {
    if (source === 'occupancy') return (data.surfaces || []).map((s) => s.surface + ':' + s.count).join('\n');
    if (source === 'plugins') return (data.rows || []).slice(0, 8).map((r) => r.name + ':' + ((r.ui || []).length)).join('\n');
    const counts = {};
    for (const i of data.items || []) counts[i.level] = (counts[i.level] || 0) + 1;
    return Object.entries(counts).map(([k, v]) => k + ':' + v).join('\n');
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
