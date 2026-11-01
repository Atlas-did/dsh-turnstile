// Local review annotations. The model is shared by Node tests and the console;
// persistence stays in the browser so adding a note never writes the profile.
export const ANNOTATION_SCHEMA = 'turnstile/annotation@1';
export const ANNOTATION_KINDS = ['question', 'issue', 'decision', 'note'];

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const targetOf = (value) => {
  const target = value && typeof value === 'object' ? value : {};
  return {
    view: text(target.view || 'overview', 40),
    kind: text(target.kind || 'page', 40),
    id: text(target.id, 180),
    title: text(target.title || '当前页面', 240),
    archId: text(target.archId, 240),
  };
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
    createdAt: text(input.createdAt || now, 40),
    updatedAt: now,
  };
}

export function normalizeAnnotations(value) {
  const rows = Array.isArray(value) ? value : (Array.isArray(value?.annotations) ? value.annotations : []);
  const seen = new Set();
  const out = [];
  for (const row of rows.slice(0, 500)) {
    try {
      const note = createAnnotation({ ...row, now: row.updatedAt || row.createdAt });
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      out.push(note);
    } catch {}
  }
  return out;
}

export function annotationCounts(notes) {
  const rows = normalizeAnnotations(notes);
  const resolved = rows.filter((n) => n.status === 'resolved').length;
  return { total: rows.length, open: rows.length - resolved, resolved };
}

export function annotationsMarkdown(notes, options = {}) {
  const rows = normalizeAnnotations(notes);
  const labels = { question: '疑问', issue: '问题', decision: '决定', note: '备注' };
  const lines = ['# Turnstile 批注', '', 'Profile：' + text(options.profile || '未命名', 120), '导出时间：' + new Date().toISOString(), '未解决：' + rows.filter((n) => n.status !== 'resolved').length + ' / 共 ' + rows.length + ' 条', ''];
  if (!rows.length) lines.push('暂无批注。', '');
  rows.forEach((n, i) => {
    lines.push('## ' + (i + 1) + '. [' + (n.status === 'resolved' ? '已解决' : '待处理') + '] ' + labels[n.kind]);
    lines.push('', '- 位置：' + n.target.view + ' / ' + n.target.title, '- 时间：' + n.createdAt);
    if (n.quote) lines.push('', '> ' + n.quote.split(/\r?\n/).join('\n> '));
    lines.push('', n.text, '');
  });
  return lines.join('\n');
}

if (typeof window !== 'undefined') window.TurnstileAnnotations = { ANNOTATION_SCHEMA, ANNOTATION_KINDS, createAnnotation, normalizeAnnotations, annotationCounts, annotationsMarkdown };
