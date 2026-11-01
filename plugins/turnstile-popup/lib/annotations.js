// Local review annotations. Shared by Node tests and the console; persistence stays in the browser.
export const ANNOTATION_SCHEMA = 'turnstile/annotation@1';
export const ANNOTATION_KINDS = ['question', 'issue', 'decision', 'note'];
export const CAPTURE_STATES = ['none', 'pending', 'captured', 'failed', 'unavailable'];

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const rectOf = (value) => {
  if (!value || typeof value !== 'object') return null;
  const x = num(value.x); const y = num(value.y); const width = num(value.width); const height = num(value.height);
  if (x == null || y == null || width == null || height == null) return null;
  if (width < 0 || height < 0) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
};
const viewportOf = (value) => {
  if (!value || typeof value !== 'object') return null;
  const width = num(value.width); const height = num(value.height);
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
};
const targetOf = (value) => {
  const target = value && typeof value === 'object' ? value : {};
  return {
    view: text(target.view || 'overview', 40),
    kind: text(target.kind || 'page', 40),
    id: text(target.id, 180),
    title: text(target.title || '当前页面', 240),
    archId: text(target.archId, 240),
    selector: text(target.selector, 300),
    domPath: text(target.domPath, 300),
    tag: text(target.tag, 40),
    text: text(target.text, 200),
    rect: rectOf(target.rect),
  };
};
const pageOf = (value) => {
  const page = value && typeof value === 'object' ? value : {};
  return { url: text(page.url, 500), title: text(page.title, 200), viewport: viewportOf(page.viewport) };
};
const captureOf = (value) => {
  const capture = value && typeof value === 'object' ? value : {};
  const status = CAPTURE_STATES.includes(capture.status) ? capture.status : 'none';
  return { status, error: text(capture.error, 200) };
};

export function createAnnotation(input = {}) {
  const body = text(input.text, 4000);
  if (!body) throw new Error('批注内容不能为空');
  const id = text(input.id, 100);
  if (!id) throw new Error('批注缺少 id');
  const now = text(input.now || new Date().toISOString(), 40);
  return {
    schema: ANNOTATION_SCHEMA,
    id,
    kind: ANNOTATION_KINDS.includes(input.kind) ? input.kind : 'note',
    status: input.status === 'resolved' ? 'resolved' : 'open',
    text: body,
    quote: text(input.quote, 1000),
    target: targetOf(input.target),
    page: pageOf(input.page),
    capture: captureOf(input.capture),
    createdAt: text(input.createdAt || now, 40),
    updatedAt: now,
  };
}

export function createDraft(input = {}) {
  return {
    kind: ANNOTATION_KINDS.includes(input.kind) ? input.kind : 'question',
    text: text(input.text, 4000),
    quote: text(input.quote, 1000),
    target: targetOf(input.target),
    page: pageOf(input.page),
    capture: captureOf(input.capture),
  };
}

export function normalizeAnnotations(value) {
  const rows = Array.isArray(value) ? value : (Array.isArray(value && value.annotations) ? value.annotations : []);
  const seen = new Set(); const out = [];
  for (const row of rows.slice(0, 500)) {
    try {
      const note = createAnnotation(Object.assign({}, row, { now: row.updatedAt || row.createdAt }));
      if (seen.has(note.id)) continue;
      seen.add(note.id); out.push(note);
    } catch {}
  }
  return out;
}

export function annotationCounts(notes) {
  const rows = normalizeAnnotations(notes);
  const resolved = rows.filter((n) => n.status === 'resolved').length;
  return { total: rows.length, open: rows.length - resolved, resolved };
}

/** 稳定编号：按完整列表（不是筛选结果）从 1 开始。 */
export function annotationNumbers(notes) {
  const rows = normalizeAnnotations(notes);
  const map = new Map();
  rows.forEach((n, i) => map.set(n.id, i + 1));
  return map;
}

export function annotationsMarkdown(notes, options = {}) {
  const rows = normalizeAnnotations(notes);
  const numbers = annotationNumbers(rows);
  const labels = { question: '疑问', issue: '问题', decision: '决定', note: '备注' };
  const captureLabel = { none: '未截图', pending: '截图进行中', captured: '已截图', failed: '截图失败', unavailable: '当前环境不支持截图' };
  const lines = ['# Turnstile 批注', '', 'Profile：' + text(options.profile || '未命名', 120), '导出时间：' + new Date().toISOString(), '未解决：' + rows.filter((n) => n.status !== 'resolved').length + ' / 共 ' + rows.length + ' 条', ''];
  if (!rows.length) lines.push('暂无批注。', '');
  rows.forEach((n) => {
    lines.push('## ' + numbers.get(n.id) + '. [' + (n.status === 'resolved' ? '已解决' : '待处理') + '] ' + labels[n.kind]);
    lines.push('', '- 位置：' + n.target.view + ' / ' + n.target.title, '- 时间：' + n.createdAt);
    if (n.target.selector) lines.push('- 元素：' + n.target.selector);
    if (n.target.tag || n.target.text) lines.push('- 元素摘要：' + [n.target.tag, n.target.text].filter(Boolean).join(' · '));
    if (n.page.url) lines.push('- 页面：' + n.page.url);
    if (n.page.viewport) lines.push('- 视口：' + n.page.viewport.width + '×' + n.page.viewport.height);
    if (n.capture.status !== 'none') lines.push('- 截图：' + captureLabel[n.capture.status] + (n.capture.error ? '（' + n.capture.error + '）' : ''));
    if (n.quote) lines.push('', '> ' + n.quote.split(/\r?\n/).join('\n> '));
    lines.push('', n.text, '');
  });
  return lines.join('\n');
}

if (typeof window !== 'undefined') window.TurnstileAnnotations = { ANNOTATION_SCHEMA, ANNOTATION_KINDS, CAPTURE_STATES, createAnnotation, createDraft, normalizeAnnotations, annotationCounts, annotationNumbers, annotationsMarkdown };
