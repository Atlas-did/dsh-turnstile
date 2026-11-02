// 控制台读「上次风险扫描」的契约：文件名与 CLI --save 约定一致；缺文件就是 null，不补造空结果。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectConsoleData } from './console-data.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const profileDir = join(import.meta.dirname, '..', 'tests', 'console-fixture');
const stateDir = mkdtempSync(join(tmpdir(), 'console-risk-'));
const name = 'console-fixture';

const absent = collectConsoleData(profileDir, { stateDir });
ok('没有扫描记录时 risk 为 null', absent.risk === null);
ok('coverage 如实标记没有风险记录', absent.coverage && absent.coverage.risk === false, JSON.stringify(absent.coverage && absent.coverage.risk));

writeFileSync(join(stateDir, 'risk-' + name + '.json'), JSON.stringify({
  at: '2026-11-02T00:00:00.000Z',
  counts: { RED: 1 },
  delta: { added: ['risk.peer-only-scope|plug-red'], resolved: [], still: [] },
  findings: [{ ruleId: 'risk.peer-only-scope', subject: { kind: 'plugin', id: 'plug-red' }, plugin: 'plug-red@1.0.0', locator: { file: 'node_modules/plug-red/package.json', line: null } }],
}));
const present = collectConsoleData(profileDir, { stateDir });
ok('有记录时 risk 带时间戳与 findings', present.risk && present.risk.at === '2026-11-02T00:00:00.000Z' && present.risk.findings.length === 1);
ok('delta 被原样带进控制台数据', present.risk && present.risk.delta && present.risk.delta.added.length === 1);
ok('coverage 标记风险记录已读取', present.coverage && present.coverage.risk === true);

rmSync(stateDir, { recursive: true, force: true });
console.log(fail ? 'CONSOLE_RISK_FAILED ' + fail : 'CONSOLE_RISK_OK');
process.exitCode = fail ? 1 : 0;
