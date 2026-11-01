// findings → issue：doctor 的四类发现也必须是稳定 issue。
import { issuesFromFindings, groupIssues, issueDetail } from '../plugins/turnstile-popup/lib/health-issues.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const findings = [
  { checker: 'engines', severity: 'error', id: 'engine-skip', title: 'dsh-talk 会被引擎跳过', evidence: ['engines.dsh'] },
  { checker: 'providers', severity: 'warn', id: 'route-dup-x', title: '模型 id x 重复', evidence: ['a', 'b'] },
  { checker: 'ui-surface', severity: 'warn', id: 'ui-hot-ui-settings', title: 'ui-settings 被 7 个插件注入', evidence: ['ui-scan'] },
  { checker: 'manage', severity: 'warn', id: 'disabled-dsh-x', title: 'dsh-x 被手动停用', evidence: ['cordis.patch.yml'] },
];
const issues = issuesFromFindings(findings, { observedAt: '2026-11-02T00:00:00.000Z' });
ok('每条 finding 都成 issue', issues.length === 4);
ok('ID 以 doctor. 开头且稳定', issues.every((i) => i.id.startsWith('doctor.')) && issues[0].id === 'doctor.engine-skip');
ok('error → error，warn → warning', issues[0].severity === 'error' && issues[1].severity === 'warning');
ok('domain 按 checker 映射', issues[0].domain === 'plugins' && issues[1].domain === 'providers' && issues[2].domain === 'ui');
ok('证据带 checker 来源', issues[0].evidence[0].source === 'doctor:engines');
const groups = groupIssues(issues);
ok('进入三组', groups.needsAction.length === 1 && groups.needsReview.length === 3, JSON.stringify({ a: groups.needsAction.length, r: groups.needsReview.length }));
ok('没有伪修复按钮', issueDetail(issues[1]).next.every((x) => x.kind !== 'plan'));
ok('坏输入不抛错', issuesFromFindings('broken').length === 0 && issuesFromFindings([null]).length === 0);
console.log(fail ? 'FINDINGS_ISSUES_FAILED ' + fail : 'FINDINGS_ISSUES_OK');
process.exitCode = fail ? 1 : 0;