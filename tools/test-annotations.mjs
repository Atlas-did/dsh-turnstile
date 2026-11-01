import { createAnnotation, normalizeAnnotations, annotationCounts, annotationsMarkdown } from '../plugins/turnstile-popup/lib/annotations.js';

let fail = 0;
const ok = (name, condition, detail = '') => { console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!condition) fail++; };
const target = { view: 'plugins', kind: 'plugin', id: 'plug-alpha', title: 'plug-alpha', archId: 'plugin:0' };
const note = createAnnotation({ id: 'a1', kind: 'question', text: '  这里的依据是什么？  ', quote: '检查通过', target, now: '2026-11-01T00:00:00.000Z' });
ok('创建时清理正文并保留定位', note.text === '这里的依据是什么？' && note.target.id === 'plug-alpha' && note.status === 'open');
ok('未知类型安全回退为备注', createAnnotation({ id: 'a2', kind: 'invalid', text: 'x' }).kind === 'note');
let rejected = false;
try { createAnnotation({ id: 'blank', text: '   ' }); } catch { rejected = true; }
ok('空批注被拒绝', rejected);

const normalized = normalizeAnnotations({ annotations: [note, note, { id: 'bad', text: '' }, null] });
ok('归一化接受包装对象并去重、剔除坏项', normalized.length === 1 && normalized[0].id === 'a1');
ok('归一化不改写原时间', normalized[0].createdAt === '2026-11-01T00:00:00.000Z' && normalized[0].updatedAt === '2026-11-01T00:00:00.000Z');
ok('非数组输入不会污染页面', normalizeAnnotations('broken').length === 0 && normalizeAnnotations(null).length === 0);
const resolved = createAnnotation({ ...note, id: 'a3', status: 'resolved', now: '2026-11-01T00:01:00.000Z' });
const counts = annotationCounts([note, resolved]);
ok('计数区分待处理与已解决', counts.total === 2 && counts.open === 1 && counts.resolved === 1, JSON.stringify(counts));
const markdown = annotationsMarkdown([note, resolved], { profile: 'mini' });
ok('Markdown 包含对象、原文、正文和状态', ['plug-alpha', '检查通过', '这里的依据是什么？', '待处理', '已解决'].every((s) => markdown.includes(s)));
ok('空列表也能导出真实空态', annotationsMarkdown([], { profile: 'mini' }).includes('暂无批注'));
console.log(fail ? 'ANNOTATIONS_FAILED ' + fail : 'ANNOTATIONS_OK');
process.exitCode = fail ? 1 : 0;
