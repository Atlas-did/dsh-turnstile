// 覆盖范围（C-14）：运行时版本未知时，报告必须说「一个都没评估」，不能看着像通过。
import { coverageOf } from './lib/engine-coverage.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const rows = [
  { name: 'a', verdict: 'loads' },
  { name: 'b', verdict: 'loads (no engines.dsh)' },
  { name: 'c', verdict: 'NOT INSTALLED' },
];
const known = coverageOf({ rows, runtime: '0.2.1-rc.3' });
ok('有运行时版本：按声明与未声明分开描述', known.runtimeKnown === true && /没有声明/.test(known.note), known.note);
ok('未安装被单独计数', known.notInstalled === 1 && known.evaluated === 2, JSON.stringify(known));
const unknown = coverageOf({ rows, runtime: '' });
ok('没有运行时版本：写明一个都没评估', unknown.runtimeKnown === false && /没有任何插件被 engines\.dsh 评估/.test(unknown.note), unknown.note);
const allClean = coverageOf({ rows: [{ name: 'a', verdict: 'loads' }], runtime: 'x' });
ok('全部按声明评估过才算那一句', /全部插件都按声明评估过/.test(allClean.note), allClean.note);
console.log(fail ? 'ENGINES_COVERAGE_FAILED ' + fail : 'ENGINES_COVERAGE_OK');
process.exitCode = fail ? 1 : 0;
