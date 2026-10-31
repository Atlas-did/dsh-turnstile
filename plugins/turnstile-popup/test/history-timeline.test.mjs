// History timeline: jumping works, transients stay out, no-ops leave no trace.
import { createTimeline, append, current, step, jumpTo, canUndo, canRedo, rows, reset, STEP_KIND } from '../lib/history-timeline.js';

let fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!cond) fail++; };

// 1. Append carries time, kind and label - a timeline row must be readable on its own.
let t = createTimeline();
append(t, { state: ['a'], kind: STEP_KIND.ADD, label: '加入 a', at: 1000 });
append(t, { state: ['a', 'b'], kind: STEP_KIND.ADD, label: '加入 b', at: 2000 });
ok('两条历史', t.steps.length === 2);
ok('带时间', t.steps[1].at === 2000);
ok('带类型', t.steps[1].kind === STEP_KIND.ADD);
ok('带标签', t.steps[1].label === '加入 b');
ok('游标在末尾', t.cursor === 1);
ok('rows 渲染两条', rows(t).length === 2 && rows(t)[1].current === true);

// 2. Jumping, not just stepping.
ok('可以跳回第 0 步', jumpTo(t, 0) === true);
ok('跳转后状态是第 0 步', JSON.stringify(current(t)) === '["a"]');
ok('可以跳回末尾', jumpTo(t, 1) === true);
ok('越界跳转被拒', jumpTo(t, 5) === false && jumpTo(t, -1) === false);

// 3. canUndo / canRedo track the cursor honestly.
ok('末尾时不能 redo', canRedo(t) === false);
jumpTo(t, 0);
ok('第 0 步不能 undo', canUndo(t) === false);
ok('第 0 步可以 redo', canRedo(t) === true);
jumpTo(t, 1);

// 4. A new edit discards the unreachable future.
let f = createTimeline();
append(f, { state: 1 }); append(f, { state: 2 }); append(f, { state: 3 });
jumpTo(f, 1);
append(f, { state: 9, kind: STEP_KIND.EDIT });
ok('新编辑截断未来', f.steps.length === 3 && JSON.stringify(current(f)) === '9');

// 5. Transient UI events never enter the timeline.
let p = createTimeline();
append(p, { state: 'base' });
for (const tr of ['hover', 'select', 'drag', 'focus', 'scroll']) append(p, { state: 'x-' + tr, transient: tr });
ok('临时状态不进历史', p.steps.length === 1, '实际 ' + p.steps.length);

// 6. A no-op edit (same state) is not a step.
let n = createTimeline();
append(n, { state: [1, 2] });
append(n, { state: [1, 2] });
append(n, { state: [1, 2] });
ok('同状态不新增步骤', n.steps.length === 1);

// 7. step() moves by delta and refuses to run off either end.
let s = createTimeline();
append(s, { state: 'a' }); append(s, { state: 'b' }); append(s, { state: 'c' });
ok('后退一步', step(s, -1) === true && current(s) === 'b');
ok('再后退', step(s, -1) === true && current(s) === 'a');
ok('到底后不再后退', step(s, -1) === false);
ok('前进两步', step(s, 1) === true && step(s, 1) === true && current(s) === 'c');
ok('到底后不再前进', step(s, 1) === false);

// 8. The limit drops the oldest, never the newest.
let l = createTimeline({ limit: 3 });
for (let i = 0; i < 6; i++) append(l, { state: i, at: i });
ok('超限只保留最近 N 条', l.steps.length === 3 && JSON.stringify(current(l)) === '5', '实际 ' + l.steps.length);
ok('保留的是最新的三条', l.steps[0].state === 3);

// 9. reset() is a clean baseline, not an empty timeline.
let r = createTimeline();
append(r, { state: 'x' }); append(r, { state: 'y' });
reset(r, [], { at: 5 });
ok('reset 后只有一条基线', r.steps.length === 1 && r.cursor === 0);
ok('reset 后可继续 undo 吗：不可以', canUndo(r) === false);

// 10. Empty timeline answers every query without throwing.
const empty = createTimeline();
ok('空历史 current 为 undefined', current(empty) === undefined);
ok('空历史不能 undo/redo', canUndo(empty) === false && canRedo(empty) === false);
ok('空历史 rows 为空', rows(empty).length === 0);
ok('rows(null) 不抛异常', rows(null).length === 0);

console.log(fail === 0 ? 'HISTORY_TEST_OK 29 checks' : 'HISTORY_TEST_FAILED ' + fail);
process.exit(fail ? 1 : 0);
