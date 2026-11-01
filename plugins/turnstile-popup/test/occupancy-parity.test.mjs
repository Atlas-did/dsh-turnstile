// occupancy 迁移到 lib/ui-scan 后的口径一致性（外部审查第 1 条：面名/计数漂移）。
import { execFileSync } from 'node:child_process';
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

console.log(fail ? 'OCCUPANCY_PARITY_FAILED ' + fail : 'OCCUPANCY_PARITY_OK');
process.exitCode = fail ? 1 : 0;
