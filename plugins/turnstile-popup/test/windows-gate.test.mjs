// 能力网关：没声明一律拒；声明等级不够也拒；理由必须能给人看。
import assert from 'node:assert';
import { declared, decide, auditLine, ACTIONS } from '../lib/windows-gate.js';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const none = declared({});
ok('没写 dsh.windows 时四个能力全是 none', Object.values(none).every((v) => v === 'none'));
ok('没声明 -> uia.read 被拒', decide(none, 'uia.read').allow === false);
ok('拒绝理由点名了声明', /没有声明 windows\.uia/.test(decide(none, 'uia.read').reason));

const reader = declared({ dsh: { windows: { uia: 'read' } } });
ok('声明 read -> 读允许', decide(reader, 'uia.read').allow === true);
ok('声明 read -> 操作被拒', decide(reader, 'uia.act').allow === false);
ok('等级不足的理由带 note', /点按钮|输入/.test(decide(reader, 'uia.act').reason));

const actor = declared({ dsh: { windows: { uia: 'act' } } });
ok('声明 act -> 读也允许（高阶含低阶）', decide(actor, 'uia.read').allow === true);
ok('声明 act -> 操作允许', decide(actor, 'uia.act').allow === true);

ok('拼错的等级按 none 处理', declared({ dsh: { windows: { uia: 'READ' } } }).uia === 'none');
ok('未知动作被拒', decide(actor, 'uia.nuke').allow === false);
ok('每个动作用一个已知能力', Object.values(ACTIONS).every((a) => ['uia', 'input', 'fs', 'proc'].includes(a.capability)));

const line = auditLine({ plugin: 'p', action: 'uia.read', verdict: 'allow', reason: 'ok', at: 'T' });
const parsed = JSON.parse(line);
ok('审计行是单行 JSON', line.endsWith('\n') && parsed.plugin === 'p' && parsed.at === 'T');

console.log(fail ? 'WINDOWSGATE_TEST_FAILED ' + fail : 'WINDOWSGATE_TEST_OK');
process.exitCode = fail ? 1 : 0;
