// 用法错误 vs 检查失败（方案 C）：两者都退 2，但契约层必须给出不同结论。
import { shapeReport, EXIT } from './lib/report.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const usage = shapeReport({ command: 'doctor', exitCode: 2, parsed: null, stderr: 'usage: node tools/doctor.mjs <profile>' });
ok('用法错误 → verdict usage 且不复述为 warn', usage.verdict === 'usage' && usage.ok === false, usage.verdict);
ok('用法错误的摘要直接给出怎么用', /输入有误/.test(usage.summary) && /usage:/.test(usage.summary), usage.summary);
const warn = shapeReport({ command: 'doctor', exitCode: 2, parsed: { summary: 'warn', findings: [{ severity: 'warn', message: '停用了 1 个' }] }, stderr: '' });
ok('真正的检查失败仍是 warn（不能被误判成用法）', warn.verdict === 'warn', warn.verdict);
const noJsonNoUsage = shapeReport({ command: 'doctor', exitCode: 2, parsed: null, stderr: 'boom' });
ok('没有 usage: 行的 2 不算用法错误', noJsonNoUsage.verdict === 'warn', noJsonNoUsage.verdict);
ok('EXIT 表与 CLI 一致（usage 记 2）', EXIT.usage === 2 && EXIT.warn === 2 && EXIT.fail === 1 && EXIT.ok === 0);
const withJson = shapeReport({ command: 'doctor', exitCode: 2, parsed: { summary: 'x' }, stderr: 'usage: something' });
ok('有 JSON 输出时即使 stderr 有 usage 也不判用法', withJson.verdict !== 'usage', withJson.verdict);
console.log(fail ? 'USAGE_VERDICT_FAILED ' + fail : 'USAGE_VERDICT_OK');
process.exitCode = fail ? 1 : 0;
