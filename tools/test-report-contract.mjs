// 统一契约（03 §2）：next[] 是灵魂，unknown 是一等公民，rollback 只给写操作。
import { shapeReport, verdictFromExit, EXIT } from './lib/report.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('exit→verdict 映射', verdictFromExit(0) === 'ok' && verdictFromExit(1) === 'fail' && verdictFromExit(2) === 'warn' && verdictFromExit(3) === 'unknown' && verdictFromExit(4) === 'unknown');
ok('EXIT 常量与设计一致', EXIT.ok === 0 && EXIT.warn === 2 && EXIT.unknown === 3 && EXIT.usage === 4);

const failRep = shapeReport({ command: 'gate', exitCode: 1, parsed: { findings: [{ checker: 'prompt-vars', severity: 'error', message: 'bad ${X}', evidence: { file: 'a.yml' } }] }, mutating: false, durationMs: 9 });
ok('fail 带 findings', failRep.verdict === 'fail' && failRep.findings.length === 1);
ok('finding 有 falsifier（可证伪）', typeof failRep.findings[0].falsifier === 'string' && failRep.findings[0].falsifier.length > 4);
ok('finding 证据被规范成数组', Array.isArray(failRep.findings[0].evidence) && failRep.findings[0].evidence.length === 1);
ok('next 给出可执行命令', failRep.next.length >= 1 && failRep.next[0].command.includes('turnstile'));
ok('next 项含 label/command/mutating/reason', ['label','command','mutating','reason'].every((k) => k in failRep.next[0]));

const unknownRep = shapeReport({ command: 'doctor', exitCode: 3, parsed: null, stderr: 'no evidence', durationMs: 5 });
ok('unknown 是一等公民', unknownRep.verdict === 'unknown');
ok('unknown 明确劝阻擅自修复', unknownRep.next.some((n) => /补齐证据|不要擅自修复/.test(n.label + n.reason)));

const dry = shapeReport({ command: 'snapshot-take', exitCode: 0, parsed: {}, mutating: true, dryRun: true, applyToken: 't', durationMs: 3 });
ok('写操作 dryRun 带 rollback', Boolean(dry.rollback && dry.rollback.command));
ok('dryRun 带 applyToken', dry.applyToken === 't');
ok('写操作 next 提示确认执行', dry.next.some((n) => n.mutating));

const readOnly = shapeReport({ command: 'surfaces', exitCode: 0, parsed: {}, mutating: false, durationMs: 1 });
ok('只读命令没有 rollback', readOnly.rollback === undefined);
ok('只读 ok 也给下一步', readOnly.next.length >= 1);

console.log(fail ? 'REPORT_CONTRACT_FAILED ' + fail : 'REPORT_CONTRACT_OK');
process.exitCode = fail ? 1 : 0;
