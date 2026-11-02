// 第一批（身份与生命周期）的契约测试：重点是两个「不能做」的负例。
import { facts, compareIdentity, onSourceMissing, restartState, stableIdFor, LIFECYCLE_SCHEMA } from './lib/lifecycle.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('稳定身份由包名决定，与行 id / 版本无关', stableIdFor('Plug-A') === 'plugin:plug-a' && stableIdFor('') === '');
const f = facts({ packageName: 'plug-a', declaredVersion: '1.0.0', installedVersion: '0.9.0', enabled: true, bootId: 'b2', observedBootId: 'b1' });
ok('schema 与身份落进记录', f.schema === LIFECYCLE_SCHEMA && f.stableId === 'plugin:plug-a');
ok('声明版本与磁盘版本分开记录', f.version.declared === '1.0.0' && f.version.installed === '0.9.0' && f.version.mismatch === true);
ok('跨启动 → 待重启（配置写了不等于已生效）', f.pendingRestart === true && f.loadState === 'observed-previous-boot');
const same = facts({ packageName: 'plug-a', declaredVersion: '1.0.0', installedVersion: '1.0.0', enabled: true, bootId: 'b2', observedBootId: 'b2' });
ok('同一次启动观测到 → 不是待重启', same.pendingRestart === false && same.loadState === 'observed-this-boot');
const unseen = facts({ packageName: 'plug-a', declaredVersion: '1.0.0', installedVersion: null, enabled: true, bootId: 'b2' });
ok('磁盘没有 → 未安装，而不是「未通过」', unseen.loadState === 'not-installed');
ok('没有观测数据时 loadState 不是 observed', unseen.loadState !== 'observed-this-boot');

// 负例 1：改名不能自动合并历史
const prev = facts({ packageName: 'plug-a', declaredVersion: '1.0.0', installedVersion: '1.0.0', enabled: true, bootId: 'b2', observedBootId: 'b2' });
const renamed = { ...facts({ packageName: 'plug-b', declaredVersion: '1.0.0', installedVersion: '1.0.0', enabled: true, bootId: 'b2', observedBootId: 'b2' }), rowIds: ['profile:plug-b#1'] };
const cmp = compareIdentity({ ...prev, rowIds: ['profile:plug-b#1'] }, renamed);
ok('改名只报「疑似」，不判定为同一个', cmp.verdict === 'suspected-rename' && cmp.merged === false, JSON.stringify(cmp));
ok('改名证据可读（共用行/同版本）', cmp.evidence.length > 0 && cmp.evidence.some((e) => /行|版本/.test(e)));
ok('完全不同的包不误报改名', compareIdentity(prev, { ...facts({ packageName: 'other' }), rowIds: ['x'] }).verdict === 'different');
ok('缺身份时给 unknown，不猜', compareIdentity({}, renamed).verdict === 'unknown');

// 负例 2：上游下架不等于删除本地
const delisted = onSourceMissing({ ...prev, version: { declared: '1.0.0', installed: '1.0.0', mismatch: false } });
ok('已安装：保留本地并只警告', delisted.keepLocal === true && delisted.action === 'warn' && delisted.sourceState === 'delisted');
const notInstalled = onSourceMissing({ ...prev, version: { declared: null, installed: null, mismatch: false } });
ok('未安装：才从目录移除', notInstalled.keepLocal === false && notInstalled.action === 'drop-from-catalog');

// 待重启：写入发生在本次启动之后 → true；早于本次启动 → false；缺证据 → null
const appliedNow = [{ status: 'applied', bootId: 'b2', settledAt: 'T1' }];
const r1 = restartState({ entries: appliedNow, currentBootId: 'b2' });
ok('本次启动之后写入 → 待重启', r1.pendingRestart === true, r1.reason);
const r2 = restartState({ entries: appliedNow, currentBootId: 'b3' });
ok('写入早于本次启动 → 已重启，不再待重启', r2.pendingRestart === false, r2.reason);
const r3 = restartState({ entries: [{ status: 'applied', settledAt: 'T1' }], currentBootId: 'b2' });
ok('旧记录没有 applyBootId → unknown，不冒充待重启', r3.pendingRestart === null, r3.reason);
const r4 = restartState({ entries: appliedNow, currentBootId: null });
ok('当前宿主身份未知 → unknown', r4.pendingRestart === null, r4.reason);
const r5 = restartState({ entries: [{ status: 'failed', bootId: 'b2' }, { status: 'applied', bootId: 'b9', settledAt: 'T9' }], currentBootId: 'b2' });
ok('只看最后一次已应用的记录，失败记录不参与', r5.pendingRestart === false, r5.reason);

console.log(fail ? 'LIFECYCLE_FAILED ' + fail : 'LIFECYCLE_OK');
process.exitCode = fail ? 1 : 0;
