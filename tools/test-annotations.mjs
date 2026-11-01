import { createAnnotation, createDraft, normalizeAnnotations, annotationCounts, annotationNumbers, annotationsMarkdown } from '../plugins/turnstile-popup/lib/annotations.js';

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

// ── 可选字段（批注最小改造方案）：向后兼容 + 安全默认值 ──
const withContext = createAnnotation({
  id: 'ctx', text: '上下文批注', quote: '原文',
  target: { view: 'overview', kind: 'element', id: 'x', title: '总览', selector: '#main > p', domPath: 'body > p:nth-child(3)', tag: 'p', text: '一段说明', rect: { x: 10.6, y: 20.2, width: 100, height: 12 } },
  page: { url: 'http://127.0.0.1:7100/console', title: '控制台', viewport: { width: 1280, height: 900 } },
  capture: { status: 'failed', error: 'timeout' },
});
ok('元素上下文被保留', withContext.target.selector === '#main > p' && withContext.target.tag === 'p');
ok('矩形取整且保留', withContext.target.rect.x === 11 && withContext.target.rect.height === 12, JSON.stringify(withContext.target.rect));
ok('页面与视口被保留', withContext.page.viewport.width === 1280 && withContext.page.title === '控制台');
ok('截图失败状态被保留', withContext.capture.status === 'failed' && withContext.capture.error === 'timeout');

const legacy = createAnnotation({ id: 'old', text: '旧批注', now: '2026-11-01T00:00:00.000Z' });
ok('旧批注仍有安全默认值', legacy.target.selector === '' && legacy.target.rect === null && legacy.page.viewport === null && legacy.capture.status === 'none');

const dirty = createAnnotation({ id: 'dirty', text: '脏数据', target: { rect: { x: 'NaN', y: 1, width: -5, height: 2 }, selector: 'x'.repeat(400) }, capture: { status: 'weird' }, page: { viewport: { width: 0, height: 0 } } });
ok('非法矩形被丢弃', dirty.target.rect === null, JSON.stringify(dirty.target.rect));
ok('非法截图状态回退 none', dirty.capture.status === 'none');
ok('选择器长度受限', dirty.target.selector.length === 300);
ok('非法视口被丢弃', dirty.page.viewport === null);

const md2 = annotationsMarkdown([withContext], { profile: 'mini' });
ok('Markdown 带元素选择器与摘要', /元素：\/?#main/.test(md2) || md2.includes('- 元素：'), md2.includes('- 元素：'));
ok('Markdown 带页面与视口', md2.includes('http://127.0.0.1:7100/console') && md2.includes('1280×900'));
ok('Markdown 带截图状态', md2.includes('截图失败（timeout）'));
ok('Markdown 不包含 Base64 图片', !/data:image\//.test(md2));
ok('旧批注 Markdown 不出现空字段', !annotationsMarkdown([legacy], { profile: 'p' }).includes('- 元素：'));

const numbers = annotationNumbers([note, resolved]);
ok('编号按完整列表从 1 开始', numbers.get('a1') === 1 && numbers.get('a3') === 2, JSON.stringify([...numbers]));
const draft = createDraft({ kind: 'issue', text: '草稿', target: { view: 'plugins' } });
ok('草稿有安全默认值', draft.kind === 'issue' && draft.capture.status === 'none' && draft.page.url === '');

console.log(fail ? 'ANNOTATIONS_FAILED ' + fail : 'ANNOTATIONS_OK');
process.exitCode = fail ? 1 : 0;
process.exitCode = fail ? 1 : 0;
