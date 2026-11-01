// sandbox-trial 必须以六级验证为准：没有证据就不能说「通过」。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'tools', 'sandbox-trial.mjs'), 'utf8');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('trial 调用 verify-live（不是自己再判一次）', /verify-live\.mjs/.test(src));
ok('trial 把 --dsh-bin/--base/--token 透传下去', ['--dsh-bin', '--base', '--token'].every((f) => src.includes(f)));
ok('trial 打印六层结果', /levelReport\.levels/.test(src));
ok('trial 支持 --surfaces-before（L5 面回归）', src.includes('surfaces-before'));
ok('trial 支持 --restart-cmd（重启后再验）', src.includes('restart-cmd'));
ok('没有 levelReport 时明确说「不能声称真实可用」', /不能声称真实可用/.test(src), (src.match(/不能声称真实可用/) || [''])[0]);
ok('结论用 claim 而不是「通过」', /结论（' \+ verdictWord/.test(src) || /verdictWord/.test(src));
ok('旧的「结论：通过」已删除', !/结论：通过/.test(src));
ok('六级失败会拉低 passed', /levelReport\.verdict !== 'fail'/.test(src));

console.log(fail ? 'TRIAL_WIRING_FAILED ' + fail : 'TRIAL_WIRING_OK');
process.exitCode = fail ? 1 : 0;
