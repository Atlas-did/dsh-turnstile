// 兼容矩阵必须诚实：没装的版本只能 unknown，装了的要真跑一次。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const out = execFileSync(process.execPath, [join(here, 'compat-matrix.mjs'), '--json'], { encoding: 'utf8', timeout: 300000 });
const r = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
ok('矩阵带 schema', r.kind === 'compat-matrix@1');
const fake = r.cells.find((c) => c.version === '0.2.2-alpha.2');
ok('没装的版本是 unknown', fake && fake.status === 'unknown', fake && fake.status);
ok('没装的版本不写 verified', !r.cells.some((c) => c.status === 'verified' && /未安装/.test(c.evidence)));
const verified = r.cells.filter((c) => c.status === 'verified');
for (const c of verified) ok('verified 的版本有真实依据', Boolean(c.evidence) && c.evidence.length > 4, c.version);
ok('未知/已验证/失败三种状态之外没有别的写法', r.cells.every((c) => ['verified', 'failed', 'unknown'].includes(c.status)));
console.log(fail ? 'COMPAT_MATRIX_FAILED ' + fail : 'COMPAT_MATRIX_OK');
process.exitCode = fail ? 1 : 0;