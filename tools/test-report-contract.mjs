// 统一契约（03 §2）：next[] 是灵魂，unknown 是一等公民，rollback 只给写操作。
import { shapeReport, verdictFromExit, EXIT } from './lib/report.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('exit→verdict 映射', verdictFromExit(0) === 'ok' && verdictFromExit(1) === 'fail' && verdictFromExit(2) === 'warn' && verdictFromExit(3) === 'unknown' && verdictFromExit(4) === 'unknown');
ok('EXIT 常量与设计一致', EXIT.ok === 0 && EXIT.warn === 2 && EXIT.unknown === 3 && EXIT.usage === 4);

const failRep = shapeReport({ command: 'gate', exitCode: 1, parsed: { findings: [{ checker: 'prompt-vars', severity: 'error', message: 'bad ${X}', evidence: { file: 'a.yml' } }] }, mutating: false, durationMs: 9, profile: 'p1' });
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

// 外部审查四条：summary 是人话 / next 不自指 / command 回填 profile / agentPrompt 有生产者
const doc = shapeReport({ command: 'doctor', exitCode: 0, parsed: { findings: [{ severity: 'warn', title: '某插件被停用', evidence: ['patch.yml'] }] }, mutating: false, durationMs: 3, profile: 'mini' });
ok('summary 不是状态词', !['warn','ok','fail','clear'].includes(doc.summary.toLowerCase()) && doc.summary.length > 6, doc.summary.slice(0, 30));
ok('doctor 的 next 不自指', doc.next.every((n) => !/turnstile\.mjs doctor\b/.test(n.command) || false) || doc.next.every((n) => !n.command.includes('doctor mini')), doc.next.map((n) => n.command).join(' | ').slice(0, 60));
ok('next 的 command 回填了真实 profile', doc.next.every((n) => !n.command.includes('<profile>')), doc.next[0] && doc.next[0].command);
ok('agentPrompt 有内容且点名 profile', doc.findings[0].agentPrompt.length > 20 && doc.findings[0].agentPrompt.includes('mini'), doc.findings[0].agentPrompt.slice(0, 30));

const gateRep = shapeReport({ command: 'gate', exitCode: 0, parsed: {}, mutating: false, durationMs: 1, profile: 'mini' });
ok('gate 的 next 指向 doctor（不含 gate 自己）', gateRep.next.some((n) => /doctor/.test(n.command)) && gateRep.next.every((n) => !/turnstile\.mjs gate\b/.test(n.command)));

console.log(fail ? 'REPORT_CONTRACT_FAILED ' + fail : 'REPORT_CONTRACT_OK');
process.exitCode = fail ? 1 : 0;
