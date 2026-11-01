// tools/ui-surfaces.mjs — who injects/overrides the same UI modules.
// 扫描逻辑在 tools/lib/ui-scan.mjs（与其它工具共用一份，防止口径漂移）。
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
import { scanUi, surfaceCounts } from './lib/ui-scan.mjs';
silenceWhenJson();
const profileDir = process.argv[2];
const positional = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const threshold = Number(positional[0] || process.env.DSH_UI_THRESHOLD || 10);
if (!profileDir) { console.error('usage: node tools/ui-surfaces.mjs <profileDir> [threshold]'); process.exit(2); }

const scan = scanUi(profileDir, { onlyUiSurfaces: true });
if (!scan.ok) { console.error(scan.reason); process.exit(2); }
const rows = surfaceCounts(scan).map((r) => [r.surface, r.plugins.slice().sort()]);

console.log('profile: ' + profileDir + '   bundles: ' + scan.bundles);
console.log('ui surface' + ' '.repeat(18) + 'plugins');
let hot = 0;
const above = [];
for (const [ui, who] of rows) {
  const flag = who.length > threshold ? '  <-- 超过阈值，建议收进母按钮' : '';
  if (who.length > threshold) { hot++; above.push([ui, who]); }
  console.log('  ' + ui.padEnd(26) + String(who.length).padStart(2) + '  ' + who.join(', ') + flag);
}
console.log('surfaces above threshold (' + threshold + '): ' + hot);
if (wantsJson()) {
  const findings = above.map(([ui, who]) => ({
    checker: 'ui-surface', level: 'warn', id: ui,
    message: ui + ' is injected by ' + who.length + ' plugins (>' + threshold + ')',
    evidence: { file: 'package.json', plugins: who },
    fix: { kind: 'group', snippet: 'collapse these plugins under one parent entry, or raise DSH_UI_THRESHOLD deliberately' },
  }));
  emitJson('ui-surface', findings, hot > 0 ? 11 : 0);
}
process.exit(hot > 0 ? 11 : 0);
