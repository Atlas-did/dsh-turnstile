// 三个「看」的工具：inspect-plugin / ui-atlas / diff-plugins 的契约检查。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

// ui-atlas
const html = join(dir, 'atlas.html');
const csv = join(dir, 'atlas.csv');
const atlas = run('ui-atlas.mjs', [prof, '--out', html, '--csv', csv]);
ok('atlas 生成 HTML', existsSync(html) && /UI 面/.test(readFileSync(html, 'utf8')));
const csvText = readFileSync(csv, 'utf8');
ok('atlas 生成 CSV 且有表头', csvText.startsWith('surface,plugin,kind,detail'));
ok('CSV 含两个插件', /plug-a/.test(csvText) && /plug-b/.test(csvText));
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
