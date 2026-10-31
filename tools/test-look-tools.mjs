// 三个「看」的工具：inspect-plugin / ui-atlas / diff-plugins 的契约检查。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { patchFiles as sharedPatchFiles } from './lib/patch-files.mjs';
import { patchFiles as localPatchFiles } from '../plugins/turnstile-popup/lib/plugin-inspect.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = here; // 测试文件就在 tools/ 下，直接用本目录
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (script, args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(root, script), ...args], { encoding: 'utf8', timeout: 60000 }) }; }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

const dir = mkdtempSync(join(tmpdir(), 'look-'));
const prof = join(dir, 'profiles', 'p');
mkdirSync(join(prof, 'node_modules', 'plug-a', 'lib'), { recursive: true });
mkdirSync(join(prof, 'node_modules', 'plug-b', 'lib'), { recursive: true });
writeFileSync(join(prof, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: ['plug-a', 'plug-b'] } } }));
writeFileSync(join(prof, 'cordis.patch.yml'), '- id: plug-a\n  disabled: true\n');
writeFileSync(join(prof, 'node_modules', 'plug-a', 'package.json'), JSON.stringify({
  name: 'plug-a', version: '1.0.0',
  dsh: { client: { inject: ['@deepseek-ai/dsh-client-ui-settings'], platform: 'web' }, bundle: { patch: './a.patch.yml' } },
}));
writeFileSync(join(prof, 'node_modules', 'plug-a', 'a.patch.yml'), '- insert:\n    - id: row-a\n');
writeFileSync(join(prof, 'node_modules', 'plug-a', 'lib', 'client.js'), 'exports.inject=["slots"];\nvar slot="shell.overlay";\nvar props={className: "my-btn"};\nvar html="<div class=\\"other-btn\\"></div>";\n');
writeFileSync(join(prof, 'node_modules', 'plug-b', 'package.json'), JSON.stringify({
  name: 'plug-b', version: '2.0.0',
  dsh: { client: { inject: ['@deepseek-ai/dsh-client-ui-conversation'] }, bundle: { patch: './b.patch.yml' } },
}));
writeFileSync(join(prof, 'node_modules', 'plug-b', 'b.patch.yml'), '- insert:\n    - id: row-b\n');
writeFileSync(join(prof, 'node_modules', 'plug-b', 'lib', 'client.js'), 'var x=1;\n');

// inspect-plugin
const ins = run('inspect-plugin.mjs', [prof, 'plug-a', '--json']);
const insJ = JSON.parse(ins.out);
ok('inspect 报出版本与安装态', insJ.pkg === 'plug-a' && insJ.installed === true && insJ.inBundles === true);
ok('inspect 报出 inject 面', insJ.injects.includes('@deepseek-ai/dsh-client-ui-settings'));
ok('inspect 报出 patch 行', insJ.patchRows.includes('row-a'));
ok('inspect 报出停用状态', insJ.disabled === true);
ok('inspect 抓出 slot 键', insJ.slotKeys.includes('shell.overlay'), insJ.slotKeys.join(','));
ok('inspect 抓出类名', insJ.classNames.includes('my-btn'), insJ.classNames.join(','));
ok('inspect 给了源码头', Array.isArray(insJ.head) && insJ.head.length > 0);
const missing = run('inspect-plugin.mjs', [prof, 'not-installed']);
ok('未安装的插件明确报未安装', missing.code === 3 && /未安装/.test(missing.out));

// 路径穿越：不许拼名字逃出 node_modules（真实攻击形状）
for (const evil of ['../../../secret', '../plug-a', 'a/b', '..']) {
  const bad = run('inspect-plugin.mjs', [prof, evil]);
  ok('拒绝穿越包名 ' + evil, bad.code === 2 && /包名不合法|node_modules 之外/.test(bad.out), bad.out.trim().slice(0, 50));
}
// 双份实现必须有同一个行为，否则就是手工漂移
for (const patch of ['./a.patch.yml', ['x.yml', 'y.yml'], null]) {
  const a1 = JSON.stringify(sharedPatchFiles(join(prof, 'node_modules', 'plug-a'), patch));
  const a2 = JSON.stringify(localPatchFiles(join(prof, 'node_modules', 'plug-a'), patch));
  ok('两份 patchFiles 行为一致 ' + JSON.stringify(patch), a1 === a2, a1 + ' vs ' + a2);
}

const scopedSys = run('inspect-plugin.mjs', [prof, '@scope/nothere']);
ok('合法 scoped 名字只在「没装」时报未安装', scopedSys.code === 3, String(scopedSys.code));

// ui-atlas
const html = join(dir, 'atlas.html');
const csv = join(dir, 'atlas.csv');
const atlas = run('ui-atlas.mjs', [prof, '--out', html, '--csv', csv]);
ok('atlas 生成 HTML', existsSync(html) && /UI 面/.test(readFileSync(html, 'utf8')));
const csvText = readFileSync(csv, 'utf8');
ok('atlas 生成 CSV 且有表头', csvText.startsWith('surface,plugin,kind,detail'));
ok('CSV 含两个插件', /plug-a/.test(csvText) && /plug-b/.test(csvText));
// 运行时列：用真实形状的 slot-map（slot 名带点号、entry id 带插件前缀）
const slotMap = join(dir, 'slot-map-p.json');
writeFileSync(slotMap, JSON.stringify({ at: 'now', slots: [
  { slot: 'settings.general.item', count: 2, entries: ['plug-a:item', 'someone-else:item'], declaredBy: 'an entry in "settings.section" (Gb)' },
  { slot: 'shell.overlay', count: 1, entries: ['plug-b.overlay'], declaredBy: 'an entry in "root" (Gb)' },
] }));
const rt = JSON.parse(run('ui-atlas.mjs', [prof, '--json', '--slot-map', slotMap]).out);
const row = rt.surfaces.find((s) => s.surface.includes('ui-settings') && s.entries.some((e) => e.plugin === 'plug-a'));
ok('atlas 用真实 slot 形状算出 surface 运行时条目', row && row.runtime === 2, row ? String(row.runtime) : 'no row');
ok('atlas 按插件前缀算出 pluginRuntime', row && row.entries.find((e) => e.plugin === 'plug-a').pluginRuntime === 1, JSON.stringify(row && row.entries.find((e) => e.plugin === 'plug-a')));

const atlasJ = JSON.parse(run('ui-atlas.mjs', [prof, '--json']).out);
const conv = atlasJ.surfaces.find((s) => s.surface.includes('ui-conversation'));
ok('atlas 的面对应到插件', conv && conv.entries.some((e) => e.plugin === 'plug-b'));

// diff-plugins
const d = JSON.parse(run('diff-plugins.mjs', [prof, 'plug-a', 'plug-b', '--json']).out);
ok('diff 只 A 有的面', d.injects.onlyA.includes('@deepseek-ai/dsh-client-ui-settings'));
ok('diff 只 B 有的面', d.injects.onlyB.includes('@deepseek-ai/dsh-client-ui-conversation'));
ok('diff 报出各自 patch 行', d.rows.onlyA.includes('row-a') && d.rows.onlyB.includes('row-b'));
const notBoth = run('diff-plugins.mjs', [prof, 'plug-a', 'nope']);
ok('diff 对未安装的插件报错', notBoth.code === 2);

console.log(fail ? 'LOOK_TOOLS_FAILED ' + fail : 'LOOK_TOOLS_OK');
process.exitCode = fail ? 1 : 0;
