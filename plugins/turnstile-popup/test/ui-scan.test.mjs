// UI 面扫描：唯一实现 + 与旧工具输出的一致性（防口径漂移）。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUi, surfaceCounts } from '../../../tools/lib/ui-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const fixture = join(root, 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const scan = scanUi(fixture);
ok('扫出 3 个插件', scan.bundles === 3, String(scan.bundles));
ok('插件信息带 inject 面', scan.plugins.every((p) => Array.isArray(p.injects)));
// 默认口径要连非 ui- 面一起算：用临时 profile 造一个 locale 注入来证明
const tmp = mkdtempSync(join(tmpdir(), 'uiscan-'));
mkdirSync(join(tmp, 'node_modules', 'p1'), { recursive: true });
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'x', dsh: { profile: { bundles: ['p1'] } } }));
writeFileSync(join(tmp, 'cordis.patch.yml'), '');
writeFileSync(join(tmp, 'node_modules', 'p1', 'package.json'), JSON.stringify({ name: 'p1', version: '1.0.0', dsh: { client: { inject: ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-settings'] } } }));
ok('默认口径连非 ui- 面一起算', scanUi(tmp).surfaces.size === 2 && scanUi(tmp, { onlyUiSurfaces: true }).surfaces.size === 1);

const uiOnly = scanUi(fixture, { onlyUiSurfaces: true });
const counts = surfaceCounts(uiOnly);
ok('onlyUiSurfaces 只留 ui- 面', counts.every((c) => /ui-/.test(c.surface)), counts.map((c) => c.surface).join(','));

// 与 CLI 的一致性：CLI 说 ui-settings 有 N 个插件，lib 必须一致
const cli = execFileSync(process.execPath, [join(root, 'tools', 'ui-surfaces.mjs'), fixture], { encoding: 'utf8' });
const cliSettings = /ui-settings\s+(\d+)/.exec(cli);
const libSettings = counts.find((c) => c.surface === '@deepseek-ai/dsh-client-ui-settings');
ok('lib 与 CLI 对 ui-settings 的计数一致', Boolean(cliSettings) && Boolean(libSettings) && Number(cliSettings[1]) === libSettings.count, (cliSettings ? cliSettings[1] : '?') + ' vs ' + (libSettings ? libSettings.count : '?'));

const bad = scanUi(join(root, 'tools'));
ok('不是 profile 时明确拒绝', bad.ok === false && /not a profile/.test(bad.reason));

console.log(fail ? 'UISCAN_TEST_FAILED ' + fail : 'UI_SCAN_TEST_OK');
process.exitCode = fail ? 1 : 0;
