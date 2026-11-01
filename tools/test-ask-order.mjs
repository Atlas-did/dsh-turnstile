import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cases = [
  [['帮我看看插件状态', 'desktop'], 'doctor'],
  [['desktop', '体检'], 'diagnose'],
  [['desktop', '谁占了设置页'], 'surfaces'],
  [['停用 dsh-mimir', 'desktop'], 'disable'],
];
let fail = 0;
for (const [args, want] of cases) {
  try {
    // 干净 DSH_HOME：参数顺序不该依赖本机是否已有该 profile（复审 P1-1）
    const emptyHome = mkdtempSync(join(tmpdir(), 'askhome-'));
    const out = execFileSync(process.execPath, ['tools/ask.mjs', ...args, '--json'], { encoding: 'utf8', env: Object.assign({}, process.env, { DSH_HOME: emptyHome }) });
    const j = JSON.parse(out);
    const ok = j.intent === want;
    if (!ok) fail += 1;
    console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(args) + ' → ' + j.intent);
  } catch (e) { fail += 1; console.log('FAIL ' + JSON.stringify(args) + ' → ' + String((e.stdout||'')+(e.stderr||'')).slice(0,40)); }
}
console.log(fail ? 'ASK_ORDER_FAILED ' + fail : 'ASK_ORDER_OK');
process.exitCode = fail ? 1 : 0;