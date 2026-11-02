// togglePatch：对已存在的行切换必须就地修改，不能追加同 id 的第二条记录。
import { togglePatch } from './toggle-patch.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const before = '- id: alpha-row\n  name: plug-alpha\n  config:\n    anchor: bottom-right\n- id: beta-row\n  name: plug-beta\n';
const out = togglePatch(before, 'alpha-row', true);
const idCount = (out.match(/^- id:\s*alpha-row$/gm) || []).length;
ok('只有一条 alpha-row（不重复追加）', idCount === 1, 'count=' + idCount);
ok('disabled 写进了原来那一行', /- id: alpha-row[\s\S]*?disabled: true[\s\S]*?- id: beta-row/.test(out), JSON.stringify(out.slice(0, 90)));
ok('原有 config 保留', /anchor: bottom-right/.test(out));
ok('其他行没被动过', /- id: beta-row[\s\S]*name: plug-beta/.test(out));
const again = togglePatch(out, 'alpha-row', true);
ok('已停用再停用：幂等', again === out);
const back = togglePatch(out, 'alpha-row', false);
ok('重新启用只去掉 disabled', !/disabled: true/.test(back) && /- id: alpha-row/.test(back) && /anchor: bottom-right/.test(back));
const missing = togglePatch(before, 'gamma-row', true);
ok('不存在的行仍然追加（合法）', /- id: gamma-row\n  disabled: true/.test(missing));
console.log(fail ? 'TOGGLE_PATCH_FAILED ' + fail : 'TOGGLE_PATCH_OK');
process.exitCode = fail ? 1 : 0;
