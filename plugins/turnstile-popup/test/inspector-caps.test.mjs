// Integration: the inspector's action state comes from the capability model, so a plugin with no
// profile row cannot show an enabled 停用 button.
import * as capsModule from '../lib/capabilities.js';
// The browser gets capabilities from a <script>; inject the same module under the same global.
globalThis.__caps = capsModule;
const { buildInspector } = await import('../lib/inspector-model.js');

let fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!cond) fail++; };

const data = {
  plugins: [
    { name: 'seated', rows: ['seated'], disabled: false },
    { name: 'noseat', rows: [], disabled: false },
    { name: 'hard', rows: ['hard'], hardcoded: true },
  ],
  surfaces: [{ surface: 'ui-settings', count: 1 }, { surface: 'ui-conversation', count: 4 }],
  report: { checks: [{ name: 'risk', ok: true, findings: [] }] },
};
const act = (sel) => Object.fromEntries(buildInspector(sel, data).actions.map((a) => [a.id, a]));

const seated = act({ kind: 'plugin', title: 'seated' });
ok('有行插件 -> 停用可点', seated.toggle.enabled === true);
ok('有行插件 -> 改位置可点', seated.anchor.enabled === true);

const noseat = act({ kind: 'plugin', title: 'noseat' });
ok('无行插件 -> 停用不可点', noseat.toggle.enabled === false);
ok('无行插件 -> 停用给理由', noseat.toggle.reason.length > 0, noseat.toggle.reason);
ok('无行插件 -> 改位置不可点', noseat.anchor.enabled === false);
ok('无行插件 -> 定位仍可点', noseat.locate.enabled === true);

const hard = act({ kind: 'plugin', title: 'hard' });
ok('硬编码 -> 停用可点', hard.toggle.enabled === true);
ok('硬编码 -> 改位置不可点', hard.anchor.enabled === false);
ok('硬编码 -> 改位置给理由', hard.anchor.reason.length > 0, hard.anchor.reason);

const single = act({ kind: 'surface', title: 'ui-settings' });
const crowd = act({ kind: 'surface', title: 'ui-conversation' });
ok('单占用面 -> 融合不可点', single.fuse.enabled === false);
ok('单占用面 -> 融合给理由', single.fuse.reason.length > 0);
ok('多占用面 -> 融合可点', crowd.fuse.enabled === true);

let allReasons = true;
for (const sel of [{ kind: 'plugin', title: 'noseat' }, { kind: 'plugin', title: 'hard' }, { kind: 'surface', title: 'ui-settings' }]) {
  for (const a of buildInspector(sel, data).actions) {
    if (!a.enabled && !(a.reason || '').trim()) { allReasons = false; console.log('   缺理由:', sel.title, a.id); }
  }
}
ok('不变量：所有禁用动作都带理由', allReasons);

console.log(fail === 0 ? 'INSPECTOR_CAPS_TEST_OK 13 checks' : 'INSPECTOR_CAPS_TEST_FAILED ' + fail);
process.exit(fail ? 1 : 0);
