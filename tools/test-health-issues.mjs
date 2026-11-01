// issue 归一化与生命周期：稳定 ID、unknown 独立、复检不假装恢复（方案 02-A/D）。
import { issuesFromHealth, groupIssues, issueDetail, recheckIssue, issueKey, ruleOf } from '../plugins/turnstile-popup/lib/health-issues.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const items = [
  { id: 'credentials', level: 'fail', message: 'AA 凭据缺失', next: '登录一次' },
  { id: 'bundles', level: 'pass', message: '31 个 bundle 都能解析' },
  { id: 'bridge', level: 'warn', message: 'endpoint 20 分钟没更新', next: '重启' },
  { id: 'auth', level: 'skip', message: '库被锁，读不到' },
  { id: 'plugin:dsh-foo', level: 'fail', message: 'dsh-foo 未安装' },
  { id: 'pit:duplicate-market', level: 'warn', message: '两个市场' },
];
const issues = issuesFromHealth(items, { observedAt: '2026-11-02T00:00:00.000Z' });
ok('pass 项不生成 issue', issues.length === 5, String(issues.length));
ok('issue 带 schema 与证据来源', issues[0].schema === 'turnstile/health-issue@1' && issues[0].evidence[0].source === 'health-collect');
ok('fail → error，warn → warning，skip → unknown',
  issues[0].severity === 'error' && issues.find((i) => i.id === 'env.bridge').severity === 'warning' && issues.find((i) => i.id === 'env.auth').severity === 'unknown',
  issues.map((i) => i.id + '=' + i.severity).join(','));

const keyA = issueKey(issues[0]);
const changed = issuesFromHealth([{ id: 'credentials', level: 'fail', message: '凭据缺失（文案改了）' }])[0];
ok('同一对象同一规则 → 稳定键不变', issueKey(changed) === keyA, keyA);
ok('不同对象 → 不同键', issueKey(issues.find((i) => i.id === 'plugins.plugin-state')) !== keyA);

const groups = groupIssues(issues);
ok('三组：需要处理 / 需要了解 / 尚无结论',
  groups.needsAction.length === 2 && groups.needsReview.length === 2 && groups.unknown.length === 1,
  JSON.stringify({ a: groups.needsAction.length, r: groups.needsReview.length, u: groups.unknown.length }));

const detail = issueDetail(groups.needsAction[0]);
ok('详情四段齐全', Boolean(detail.what && detail.who && detail.why.length && detail.next.length), JSON.stringify(detail).slice(0, 80));
const noRepair = issueDetail(issues.find((i) => i.id === 'env.bridge'));
ok('没有修复器时不出现「准备修复计划」', !noRepair.next.some((x) => x.kind === 'plan'), JSON.stringify(noRepair.next));

const resolved = recheckIssue(issues[0], [{ id: 'credentials', level: 'pass', message: 'ok' }]);
ok('复检到 pass 才算 resolved', resolved.resolution === 'resolved');
const stillBad = recheckIssue(issues[0], [{ id: 'credentials', level: 'fail', message: '还是缺' }]);
ok('复检仍失败保持 open', stillBad.resolution === 'open');
const noEvidence = recheckIssue(issues[0], null);
ok('复检采集不到证据 → recheck-required', noEvidence.resolution === 'recheck-required');
const gone = recheckIssue(issues[0], []);
ok('复检没有该项 → recheck-required（不是 resolved）', gone.resolution === 'recheck-required');

const tricky = issuesFromHealth([{ id: 'credentials', level: 'fail', message: 'token=abcdef123 secret: xyz', next: 'api_key=zzz' }])[0];
ok('证据里不保留疑似令牌', !/abcdef123|xyz|zzz/.test(JSON.stringify(tricky)), JSON.stringify(tricky.evidence));

ok('空输入不生成「全部健康」', issuesFromHealth([]).length === 0 && groupIssues([]).needsAction.length === 0);
ok('坏输入不抛错', issuesFromHealth('broken').length === 0 && issuesFromHealth([null, 3]).length === 0);
ok('未知规则也有稳定 ID', ruleOf('weird').rule === 'health.weird');

console.log(fail ? 'HEALTH_ISSUES_FAILED ' + fail : 'HEALTH_ISSUES_OK');
process.exitCode = fail ? 1 : 0;