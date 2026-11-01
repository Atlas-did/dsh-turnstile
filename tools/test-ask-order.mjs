import { execFileSync } from 'node:child_process';
const cases = [
  [['帮我看看插件状态', 'desktop'], 'doctor'],
  [['desktop', '体检'], 'diagnose'],
  [['desktop', '谁占了设置页'], 'surfaces'],
  [['停用 dsh-mimir', 'desktop'], 'disable'],
];
let fail = 0;
for (const [args, want] of cases) {
  try {
    const out = execFileSync(process.execPath, ['tools/ask.mjs', ...args, '--json'], { encoding: 'utf8' });
    const j = JSON.parse(out);
    const ok = j.intent === want;
    if (!ok) fail += 1;
    console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(args) + ' → ' + j.intent);
  } catch (e) { fail += 1; console.log('FAIL ' + JSON.stringify(args) + ' → ' + String((e.stdout||'')+(e.stderr||'')).slice(0,40)); }
}
console.log(fail ? 'ASK_ORDER_FAILED ' + fail : 'ASK_ORDER_OK');
process.exitCode = fail ? 1 : 0;