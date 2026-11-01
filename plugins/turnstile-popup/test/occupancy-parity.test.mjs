// occupancy 迁移到 lib/ui-scan 后的口径一致性（外部审查第 1 条：面名/计数漂移）。
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUi, surfaceCounts } from '../../../tools/lib/ui-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const fixture = join(root, 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const occ = execFileSync(process.execPath, [join(root, 'tools', 'occupancy.mjs'), fixture], { encoding: 'utf8' });
const rows = occ.split('\n').filter((l) => /^[! ] ui-/.test(l));
ok('occupancy 输出面行', rows.length > 0, String(rows.length));

// 从 occupancy 行里取「面 短名 → 计数」
const occCount = {};
for (const line of rows) {
  const m = /^[! ] (ui-[\w-]+)\s+(\d+)/.exec(line);
  if (m) occCount[m[1]] = Number(m[2]);
}

// lib 侧的同一口径：onlyUiSurfaces + 去掉官方插件 + 短名
const scan = scanUi(fixture, { onlyUiSurfaces: true });
const libCount = {};
for (const c of surfaceCounts(scan)) {
  const short = c.surface.replace('@deepseek-ai/dsh-client-', '');
  const n = c.plugins.filter((p) => !p.startsWith('@deepseek-ai/')).length;
  if (n) libCount[short] = n;
}

const keys = new Set([...Object.keys(occCount), ...Object.keys(libCount)]);
const diff = [...keys].filter((k) => occCount[k] !== libCount[k]).map((k) => k + ': occ=' + occCount[k] + ' lib=' + libCount[k]);
ok('occupancy 与 lib 计数一致', diff.length === 0, diff.slice(0, 3).join(' | '));
ok('面名已统一为短名（不再混用全限定名）', Object.keys(occCount).every((k) => !k.startsWith('@deepseek-ai/')), Object.keys(occCount).slice(0, 3).join(','));

// doctor 与 gate-map 也迁移到同一个 lib：用它们的汇总数字对齐
// doctor / gate-map 走 <home>/profiles/<name> 布局：给夹具造一个临时 home
const tmpHome = mkdtempSync(join(tmpdir(), 'ts-home-'));
cpSync(fixture, join(tmpHome, 'profiles', 'console-fixture'), { recursive: true });
const doc = execFileSync(process.execPath, [join(root, 'tools', 'doctor.mjs'), 'console-fixture', '--home', tmpHome], { encoding: 'utf8' });
const docConv = /ui-conversation\s+(\d+)/.exec(doc);
ok('doctor 的 ui-conversation 计数与 lib 一致', Boolean(docConv) && Number(docConv[1]) === libCount['ui-conversation'], (docConv ? docConv[1] : '?') + ' vs ' + libCount['ui-conversation']);

let gm = '';
try {
  gm = execFileSync(process.execPath, [join(root, 'tools', 'gate-map.mjs'), 'console-fixture', '--home', tmpHome, '--out', join(root, 'state', 'gm-parity.html')], { encoding: 'utf8', timeout: 120000 });
} catch (e) { gm = String((e.stdout || '') + (e.stderr || '')); }
const gmSurfaces = /ui surfaces (\d+)/.exec(gm);
ok('gate-map 报出 ui 面数', Boolean(gmSurfaces), gmSurfaces ? gmSurfaces[1] : gm.slice(0, 60));
ok('gate-map 面数与 lib 一致', Boolean(gmSurfaces) && Number(gmSurfaces[1]) === Object.keys(libCount).length, (gmSurfaces ? gmSurfaces[1] : '?') + ' vs ' + Object.keys(libCount).length);

console.log(fail ? 'OCCUPANCY_PARITY_FAILED ' + fail : 'OCCUPANCY_PARITY_OK');
process.exitCode = fail ? 1 : 0;
