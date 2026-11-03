// 嵌套 config 的块也要就地改（评审 v3 item 8）：深缩进的子键不能被当成块边界。
import { toggleText } from '../plugins/turnstile-popup/lib/toggle-text.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const nested = [
  '- id: plug-a',
  '  name: plug-a',
  '  config:',
  '    anchor:',
  '      slot: ui-settings',
  '      order: 3',
  '    nested:',
  '      deep:',
  '        value: 1',
  '',
].join('\n');
const out = toggleText(nested, 'plug-a', true);
const ids = (out.match(/^- id: plug-a$/gm) || []).length;
ok('停用后仍然只有一个 id 块', ids === 1, 'count=' + ids);
ok('disabled 写进原块（config 之前）', /- id: plug-a\n  name: plug-a\n  disabled: true\n  config:/.test(out), JSON.stringify(out.slice(0, 120)));
ok('深嵌套子键全部保留', /slot: ui-settings/.test(out) && /value: 1/.test(out) && /order: 3/.test(out));
const back = toggleText(out, 'plug-a', false);
ok('重新启用后回到原始字节', back === nested, JSON.stringify(back.slice(0, 80)));
// 第二种形状：config 里带列表（容易和块边界混淆）
const listy = ['- id: plug-b', '  name: plug-b', '  config:', '    options:', '      - a', '      - b', ''].join('\n');
const listyOut = toggleText(listy, 'plug-b', true);
ok('config 里的列表不被当作块边界', (listyOut.match(/^- id: plug-b$/gm) || []).length === 1 && /- a\n      - b/.test(listyOut), JSON.stringify(listyOut));
// 第三种形状：rows 里嵌 - id:（只有顶格 - id: 才是新块）
const nestedId = ['- id: plug-c', '  name: plug-c', '  config:', '    rows:', '      - id: inner-row', '        keep: 1', ''].join('\n');
const nestedIdOut = toggleText(nestedId, 'plug-c', true);
ok('嵌套的 - id: 不算新块', (nestedIdOut.match(/^\s*- id: /gm) || []).length === 2 && /disabled: true/.test(nestedIdOut) && (nestedIdOut.match(/^\s*disabled: true/gm) || []).length === 1, JSON.stringify(nestedIdOut));

console.log(fail ? 'TOGGLE_NESTED_FAILED ' + fail : 'TOGGLE_NESTED_OK');
process.exitCode = fail ? 1 : 0;
