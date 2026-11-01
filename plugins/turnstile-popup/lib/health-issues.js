'use strict';
// 诊断 issue 归一化：稳定 ID + 证据 + 修复能力 + 生命周期（方案 02-A）。
// 只做「把已有检查结果表达成对象」，不新增检查器、不产生默认通过项。

export const ISSUE_SCHEMA = 'turnstile/health-issue@1';
export const SEVERITIES = ['info', 'warning', 'error', 'unknown'];
export const RESOLUTIONS = ['open', 'recheck-required', 'resolved', 'obsolete'];

// 键名/值层面都不带 secret：只保留定位串，并去掉明显的令牌形状
const REDACT = /(token|secret|password|apikey|api_key)[\s]*[=:][\s]*[^\s]+/gi;
const clean = (value, max = 300) => String(value == null ? '' : value).replace(REDACT, '$1=***').trim().slice(0, max);

const RULE = {
  credentials: { id: 'env.credentials', domain: 'env', repair: null },
  bridge: { id: 'env.bridge', domain: 'env', repair: null },
  bundles: { id: 'plugins.bundles', domain: 'plugins', repair: { supported: false, command: 'pnpm add <pkg>' } },
  auth: { id: 'env.auth', domain: 'env', repair: null },
};

export function ruleOf(itemId) {
  const id = clean(itemId, 120);
  if (RULE[id]) return { rule: RULE[id].id, domain: RULE[id].domain, repair: RULE[id].repair };
  if (id.startsWith('plugin:')) return { rule: 'plugins.plugin-state', domain: 'plugins', repair: { supported: true, command: 'turnstile manage-enable/disable' } };
  if (id.startsWith('pit:')) return { rule: 'plugins.pit.' + id.slice(4), domain: 'plugins', repair: null };
  return { rule: 'health.' + (id || 'unknown'), domain: 'env', repair: null };
}

const severityOf = (level) => (level === 'fail' ? 'error' : level === 'warn' ? 'warning' : level === 'pass' ? 'info' : 'unknown');

/** 健康项 → issue；pass 项不产生 issue（不制造「全部健康」的假象，也不制造噪声）。 */
export function issuesFromHealth(items, options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const observedAt = clean(options.observedAt || new Date().toISOString(), 40);
  const source = clean(options.source || 'health-collect', 60);
  const out = [];
  for (const item of rows.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    if (item.level === 'pass') continue;
    const { rule, domain, repair } = ruleOf(item.id);
    const subjectId = clean(String(item.id || '').includes(':') ? String(item.id).split(':').slice(1).join(':') : '', 180);
    out.push({
      schema: ISSUE_SCHEMA,
      id: rule,
      domain,
      subject: { kind: domain === 'plugins' ? 'plugin' : 'env', id: subjectId || clean(item.id, 120) },
      severity: severityOf(item.level),
      summary: clean(item.message, 200),
      impact: clean(item.message, 200),
      evidence: [{ source, observedAt, status: clean(item.level, 20), locator: clean(item.next || item.id, 200) }],
      repair: repair ? { supported: Boolean(repair.supported), command: repair.command || null } : { supported: false, command: null },
      resolution: item.level === 'fail' || item.level === 'warn' ? 'open' : 'open',
    });
  }
  return out;
}

/** 管家首页三组：需要处理 / 需要了解 / 尚无结论（未知单独成组）。 */
export function groupIssues(issues) {
  const rows = Array.isArray(issues) ? issues : [];
  const groups = { needsAction: [], needsReview: [], unknown: [] };
  for (const issue of rows) {
    if (issue.severity === 'error') groups.needsAction.push(issue);
    else if (issue.severity === 'unknown') groups.unknown.push(issue);
    else groups.needsReview.push(issue);
  }
  return groups;
}

/** 四段式详情：发生了什么 / 影响谁 / 凭什么 / 下一步。 */
export function issueDetail(issue) {
  const it = issue && typeof issue === 'object' ? issue : {};
  const evidence = Array.isArray(it.evidence) ? it.evidence : [];
  const next = [];
  if (it.repair && it.repair.supported && it.repair.command) next.push({ kind: 'plan', label: '准备修复计划', command: it.repair.command });
  else if (it.repair && it.repair.command) next.push({ kind: 'advice', label: '查看建议', command: it.repair.command });
  if (evidence.length) next.push({ kind: 'evidence', label: '查看本次证据' });
  return {
    what: it.summary || '没有摘要',
    who: [it.domain, it.subject && it.subject.kind, it.subject && it.subject.id].filter(Boolean).join(' / '),
    why: evidence.map((e) => [e.source, e.observedAt, e.status, e.locator].filter(Boolean).join(' · ')),
    next,
  };
}

/** 复检：只有重新采集到 pass 才算 resolved；采集不到证据一律 unknown。 */
export function recheckIssue(issue, fresh) {
  const it = issue && typeof issue === 'object' ? issue : {};
  const items = Array.isArray(fresh) ? fresh : null;
  if (!items) return Object.assign({}, it, { resolution: 'recheck-required' });
  const same = items.filter((x) => x && ruleOf(x.id).rule === it.id);
  if (!same.length) return Object.assign({}, it, { resolution: 'recheck-required' });
  const failed = same.filter((x) => x.level !== 'pass');
  if (!failed.length) return Object.assign({}, it, { resolution: 'resolved' });
  const unknown = failed.every((x) => x.level !== 'fail' && x.level !== 'warn');
  return Object.assign({}, it, { resolution: unknown ? 'recheck-required' : 'open' });
}

/** 历史对齐用的稳定键：同一对象 + 同一规则 → 同一键，内容变化不变。 */
export function issueKey(issue) {
  const it = issue && typeof issue === 'object' ? issue : {};
  return [it.id || 'unknown', it.domain || '', it.subject && it.subject.kind, it.subject && it.subject.id].filter(Boolean).join('|');
}

/** doctor 的四类 findings（停用/路由重名/UI 抢占/引擎跳过）→ 同一套 issue。ID 以 doctor. 开头。 */
export function issuesFromFindings(findings, options = {}) {
  const rows = Array.isArray(findings) ? findings : [];
  const observedAt = clean(options.observedAt || new Date().toISOString(), 40);
  const domainOf = { engines: 'plugins', providers: 'providers', 'ui-surface': 'ui', manage: 'plugins' };
  return rows.slice(0, 200).filter((f) => f && typeof f === 'object').map((f) => ({
    schema: ISSUE_SCHEMA,
    id: 'doctor.' + clean(f.id || 'unknown', 120),
    domain: domainOf[f.checker] || 'env',
    subject: { kind: clean(f.checker || 'finding', 40), id: clean(f.id || '', 180) },
    severity: f.severity === 'error' ? 'error' : f.severity === 'warn' ? 'warning' : 'unknown',
    summary: clean(f.title, 200),
    impact: clean(f.title, 200),
    evidence: [{ source: 'doctor:' + clean(f.checker || '?', 40), observedAt, status: clean(f.severity || '', 20), locator: clean((f.evidence || [])[0] || '', 200) }],
    repair: { supported: false, command: f.falsifier ? null : null },
    resolution: 'open',
  }));
}
