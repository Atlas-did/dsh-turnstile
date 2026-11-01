// 点选纯函数：选择器、路径、元素摘要、排除批注 UI（复审不依赖浏览器）。
import { isAnnotationUi, stableSelector, domPathOf, describeElement, pickableFrom, targetForElement } from '../plugins/turnstile-popup/lib/console-annotation-picker.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const el = (props) => Object.assign({
  nodeType: 1, tagName: 'DIV', id: '', parentElement: null, children: [],
  textContent: '', getAttribute: () => null,
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
}, props);

const withId = el({ id: 'main', tagName: 'MAIN' });
ok('id 优先作为选择器', stableSelector(withId) === '#main', stableSelector(withId));

const withTestid = el({ getAttribute: (k) => (k === 'data-testid' ? 'save' : null) });
ok('data-testid 生成属性选择器', stableSelector(withTestid) === '[data-testid="save"]', stableSelector(withTestid));

const parent = el({ tagName: 'SECTION', children: [] });
const childA = el({ tagName: 'P', parentElement: parent });
const childB = el({ tagName: 'P', parentElement: parent });
parent.children = [childA, childB];
const sel = stableSelector(childB);
ok('兄弟重复时带 nth-of-type', /nth-of-type\(2\)/.test(sel), sel);

ok('DOM 路径包含 body 前缀', domPathOf(childB).startsWith('body >'), domPathOf(childB).slice(0, 40));

const described = describeElement(el({ tagName: 'BUTTON', textContent: '  保存\n 按钮 ', getBoundingClientRect: () => ({ x: 1.4, y: 2.6, width: 10, height: 20 }) }));
ok('摘要标签小写并截断文本', described.tag === 'button' && described.text === '保存 按钮', JSON.stringify(described));
ok('矩形取整', described.rect.x === 1 && described.rect.y === 3, JSON.stringify(described.rect));

const uiNode = el({ closest: () => ({}) });
ok('批注自身 UI 会被排除', isAnnotationUi(uiNode) === true);
const plain = el({ closest: () => null });
ok('普通元素不算批注 UI', isAnnotationUi(plain) === false);

ok('pickableFrom 跳过 html/body', pickableFrom([el({ tagName: 'HTML' }), el({ tagName: 'BODY' }), plain]) === plain);
ok('pickableFrom 跳过批注 UI', pickableFrom([uiNode, plain]) === plain);
ok('全部不可选时返回 null', pickableFrom([el({ tagName: 'HTML' }), uiNode]) === null);

const t = targetForElement(el({ tagName: 'SPAN', textContent: 'hi', getBoundingClientRect: () => ({ x: 0, y: 0, width: 5, height: 6 }) }));
ok('targetForElement 带选择器/标签/摘要/矩形', Boolean(t.selector && t.tag === 'span' && t.text === 'hi' && t.rect && t.rect.width === 5), JSON.stringify(t).slice(0, 80));

console.log(fail ? 'ANNOTATION_PICKER_FAILED ' + fail : 'ANNOTATION_PICKER_OK');
process.exitCode = fail ? 1 : 0;