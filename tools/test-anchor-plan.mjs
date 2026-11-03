// anchor 覆盖块：在文件末尾追加 id+config，且不破坏原有结尾换行。
import { anchorOverride, anchorPreview } from './lib/anchor-plan.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const out = anchorOverride({ text: '- id: a\n  name: a\n', rowId: 'plug-x', anchor: 'bottom-right' });
ok('追加了覆盖块', /- id: plug-x\n  config:\n    anchor: bottom-right/.test(out), JSON.stringify(out));
ok('原有内容保留且没有多余空行', out.startsWith('- id: a\n  name: a\n- id: plug-x'), JSON.stringify(out.slice(0, 40)));
const noTrailing = anchorOverride({ text: '- id: a', rowId: 'r', anchor: 'top' });
ok('原文没有结尾换行也能正确拼接', /- id: a\n- id: r/.test(noTrailing));
ok('预览就是将被写入的块', anchorPreview({ rowId: 'r', anchor: 'top' }) === '- id: r\n  config:\n    anchor: top\n');
console.log(fail ? 'ANCHOR_PLAN_FAILED ' + fail : 'ANCHOR_PLAN_OK');
process.exitCode = fail ? 1 : 0;
