// doctor 的四类发现：issue id / severity 由纯函数决定，空输入不产生任何发现。
import { doctorFindings, doctorWarnCount } from './lib/doctor-findings.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const none = doctorFindings({});
ok('空输入不产生发现', none.length === 0 && doctorWarnCount({}) === 0);
const f = doctorFindings({ skipped: ['plug-a (>=0.3)'], dups: [['model-x', new Set(['a', 'b'])]], hot: [['ui-settings', 3]], userOff: ['plug-b'] });
ok('四类各产生一条', f.length === 4, JSON.stringify(f.map((x) => x.id)));
ok('引擎跳过是 error，其余是 warn', f.find((x) => x.checker === 'engines').severity === 'error' && f.filter((x) => x.checker !== 'engines').every((x) => x.severity === 'warn'));
ok('issue id 稳定且可读', f.some((x) => x.id === 'engine-skip') && f.some((x) => x.id === 'route-dup-model-x') && f.some((x) => x.id === 'ui-hot-ui-settings') && f.some((x) => x.id === 'disabled-plug-b'));
ok('计数与四类之和一致', doctorWarnCount({ skipped: [1], dups: [1, 2], hot: [1], userOff: [1, 2, 3] }) === 7);
console.log(fail ? 'DOCTOR_FINDINGS_FAILED ' + fail : 'DOCTOR_FINDINGS_OK');
process.exitCode = fail ? 1 : 0;
