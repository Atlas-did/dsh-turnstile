import { applyCommand, newPage, createStack, run } from '../plugins/turnstile-popup/lib/page-model.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

function pageWith(n) {
  let p = newPage();
  for (let i = 0; i < n; i += 1) p = applyCommand(p, { type: 'add', parentId: p.root.id, component: 'text' }).page;
  return p;
}
const types = (p) => p.root.children.map((c) => c.props.text);

// 三个节点：A B C，选中 A、B，向下移一格 → B A C? 不：AB 整体下移，结果应是 C A B
let p = pageWith(3);
const [a, b, c] = p.root.children.map((x) => x.id);
p = applyCommand(p, { type: 'removeMany', nodeIds: [a, b, c] }).page;
for (const t of ['A', 'B', 'C']) p = applyCommand(p, { type: 'add', parentId: p.root.id, component: 'text', props: { text: t } }).page;
const ids = p.root.children.map((x) => x.id);
const down = applyCommand(p, { type: 'moveMany', nodeIds: [ids[0], ids[1]], direction: 'down' });
ok('两个节点整体下移一格', types(down.page).join('') === 'CAB', types(down.page).join(''));
// 真的走一次命令栈：批量移动只应产生一个历史步（原来的断言恒真，等于没测）
let stack = createStack(p);
const before = stack.past.length;
stack = run(stack, { type: 'moveMany', nodeIds: [ids[0], ids[1]], direction: 'down' });
ok('批量移动是一次命令（一个历史步）', stack.past.length === before + 1, before + ' → ' + stack.past.length);
const undoOnce = (s) => { const last = s.past[s.past.length - 1]; return { ...s, current: last.page, past: s.past.slice(0, -1) }; };
ok('撤销一步复原整个批量移动', undoOnce(stack).current.root.children.map((c) => c.props.text).join('') === 'ABC', undoOnce(stack).current.root.children.map((c) => c.props.text).join(''));

const up = applyCommand(down.page, { type: 'moveMany', nodeIds: [ids[0], ids[1]], direction: 'up' });
ok('再上移回到 ABC', types(up.page).join('') === 'ABC', types(up.page).join(''));

const edge = (() => { try { applyCommand(p, { type: 'moveMany', nodeIds: [ids[0], ids[1]], direction: 'up' }); return null; } catch (e) { return e.message; } })();
ok('到边界时明确拒绝', /边界/.test(edge || ''), edge || '');

// 跨父级：制造两层
let q = pageWith(2);
q = applyCommand(q, { type: 'add', parentId: q.root.id, component: 'panel' }).page;
q = applyCommand(q, { type: 'add', parentId: q.root.children[2].id, component: 'text' }).page;
const cross = (() => { try { applyCommand(q, { type: 'moveMany', nodeIds: [q.root.children[0].id, q.root.children[2].children[0].id], direction: 'up' }); return null; } catch (e) { return e.message; } })();
ok('跨父级明确拒绝', /同一父级/.test(cross || ''), cross || '');

const single = (() => { try { applyCommand(p, { type: 'moveMany', nodeIds: [ids[0]], direction: 'up' }); return null; } catch (e) { return e.message; } })();
ok('少于两个明确拒绝', /至少选择两个/.test(single || ''), single || '');

console.log(fail ? 'MOVE_MANY_FAILED ' + fail : 'MOVE_MANY_OK');
process.exitCode = fail ? 1 : 0;