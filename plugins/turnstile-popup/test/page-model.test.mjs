// 页面搭建器数据层：能力声明、命令、撤销、快照跳转。
import { COMPONENTS, newPage, newNode, findNode, capabilitiesOf, applyCommand, createStack, run, undo, redo, jumpTo, resetIds } from '../lib/page-model.js';

let fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!cond) fail++; };

resetIds();
const page = newPage();

ok('根是 stack 且接受子节点', capabilitiesOf(page.root.type).acceptsChildren === true);

// 能力声明：text 不接受子节点 -> 往里加必须被拒绝
let threw = '';
try { applyCommand(page, { type: 'add', parentId: page.root.id, component: 'text' }); } catch (e) { threw = e.message; }
ok('往根里加 text 不报错', threw === '', threw);
const withText = applyCommand(page, { type: 'add', parentId: page.root.id, component: 'text' }).page;
threw = '';
try { applyCommand(withText, { type: 'add', parentId: withText.root.children[0].id, component: 'text' }); } catch (e) { threw = e.message; }
ok('往 text 里加子节点被拒且说原因', threw.length > 0 && /不接受子节点/.test(threw), threw);

// 属性声明：类型/枚举/范围都要生效
const grid = applyCommand(withText, { type: 'add', parentId: withText.root.id, component: 'grid' }).page;
ok('数字属性接受字符串数字', applyCommand(grid, { type: 'setProp', nodeId: grid.root.children[1].id, key: 'columns', value: '3' }).page.root.children[1].props.columns === 3);
threw = '';
try { applyCommand(grid, { type: 'setProp', nodeId: grid.root.children[1].id, key: 'columns', value: 99 }); } catch (e) { threw = e.message; }
ok('超出范围被拒且说明上限', /不能大于/.test(threw), threw);
threw = '';
try { applyCommand(grid, { type: 'setProp', nodeId: grid.root.children[1].id, key: 'direction', value: 'x' }); } catch (e) { threw = e.message; }
ok('不存在的属性被拒', /没有属性/.test(threw), threw);

// 移动：不能移进自己的子树
const withPanel = applyCommand(newPage(), { type: 'add', parentId: 'stack-root', component: 'panel' });
const panelPage = applyCommand(withPanel.page, { type: 'add', parentId: 'stack-root', component: 'panel' }).page;
const firstPanelId = panelPage.root.children[0].id;
const withChild = applyCommand(panelPage, { type: 'add', parentId: firstPanelId, component: 'text' }).page;
// 用「面板套面板」来测子树检查：text 会先被「不接受子节点」拦下，测不到子树规则。
const nestedPanels = applyCommand(withChild, { type: 'add', parentId: firstPanelId, component: 'panel' }).page;
const innerPanelId = nestedPanels.root.children[0].children[1].id; // [0] 是先加进去的 text
threw = '';
try { applyCommand(nestedPanels, { type: 'move', nodeId: firstPanelId, parentId: innerPanelId }); } catch (e) { threw = e.message; }
ok('不能把节点移进自己的子树', /子树/.test(threw), threw);

// 命令栈：撤销/重做/快照
let stack = createStack(newPage());
stack = run(stack, { type: 'add', parentId: stack.current.root.id, component: 'heading' });
stack = run(stack, { type: 'add', parentId: stack.current.root.id, component: 'stat' });
ok('两次命令后有两个子节点', stack.current.root.children.length === 2);
stack = undo(stack);
ok('撤销一步剩一个', stack.current.root.children.length === 1);
stack = redo(stack);
ok('重做回到两个', stack.current.root.children.length === 2);
ok('每次提交都留快照', stack.snapshots.length >= 3, 'snapshots=' + stack.snapshots.length);
const firstSnapshot = stack.snapshots[1].page;
const jumped = jumpTo(stack, 1);
ok('可以跳到历史快照', jumped.current.root.children.length === firstSnapshot.root.children.length);
ok('跳转后仍可撤销', jumped.past.length > 0);

// 删除根被拒
threw = '';
try { applyCommand(page, { type: 'remove', nodeId: page.root.id }); } catch (e) { threw = e.message; }
ok('根节点不能删除', /根节点/.test(threw), threw);

console.log(fail ? 'PAGEMODEL_TEST_FAILED ' + fail : 'PAGEMODEL_TEST_OK');
process.exitCode = fail ? 1 : 0;
