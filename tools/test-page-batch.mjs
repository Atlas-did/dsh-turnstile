import { applyCommand, newPage, newNode, findNode } from '../plugins/turnstile-popup/lib/page-model.js';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const base = newPage();
const withKids = applyCommand(base, { type: 'add', parentId: base.root.id, component: 'text' });
const p1 = withKids.page;
const id1 = p1.root.children[0].id;
const p2 = applyCommand(p1, { type: 'add', parentId: p1.root.id, component: 'heading' }).page;

// removeMany：一次删两个
const del = applyCommand(p2, { type: 'removeMany', nodeIds: p2.root.children.map((c) => c.id) });
ok('批量删除清空子节点', del.page.root.children.length === 0);
ok('批量删除不改原页面（纯函数）', p2.root.children.length === 2);

const bad = (() => { try { applyCommand(p2, { type: 'removeMany', nodeIds: [id1, 'nope'] }); return null; } catch (e) { return e.message; } })();
ok('任一目标不存在则整批失败', typeof bad === 'string' && /找不到/.test(bad), bad || '');

const rootDel = (() => { try { applyCommand(p2, { type: 'removeMany', nodeIds: [p2.root.id] }); return null; } catch (e) { return e.message; } })();
ok('根节点不能删', /根节点/.test(rootDel || ''), rootDel || '');

// 祖先+后代同时选中：只删祖先，不重复删
// 用接受子节点的容器做嵌套（panel 接受 children）
const withPanel = applyCommand(p2, { type: 'add', parentId: p2.root.id, component: 'panel' }).page;
const nested = applyCommand(withPanel, { type: 'add', parentId: withPanel.root.children[2].id, component: 'text' }).page;
const parentId = withPanel.root.children[2].id;
const childId = nested.root.children[2].children[0].id;
const both = applyCommand(nested, { type: 'removeMany', nodeIds: [parentId, childId] }).page;
ok('祖先与后代同选时只删祖先', both.root.children.length === 2 && !findNode(both.root, parentId));

// pasteMany
const clip = [p2.root.children[0], p2.root.children[1]];
const pasted = applyCommand(p2, { type: 'pasteMany', parentId: p2.root.id, nodes: clip }).page;
ok('批量粘贴插入两个节点', pasted.root.children.length === 4);
ok('粘贴得到新 id', pasted.root.children[2].id !== clip[0].id && pasted.root.children[3].id !== clip[1].id);
ok('粘贴保留顺序', pasted.root.children[2].type === clip[0].type && pasted.root.children[3].type === clip[1].type);

const empty = (() => { try { applyCommand(p2, { type: 'pasteMany', parentId: p2.root.id, nodes: [] }); return null; } catch (e) { return e.message; } })();
ok('空剪贴板明确报错', /空/.test(empty || ''), empty || '');

console.log(fail ? 'PAGE_BATCH_FAILED ' + fail : 'PAGE_BATCH_OK');
process.exitCode = fail ? 1 : 0;