// Hook rules as data: the host owns the list, the page evaluates it.
//
// Why data and not code: a hook that lives in the page cannot be added by a profile owner, and a hook
// that lives in the host cannot see the designer queue. So the host ships *rules* (JSON) and the page
// evaluates them against the operation it is about to enqueue. Unknown kinds are refused at load, not
// ignored, so a typo cannot silently disable a rule.

export const KINDS = Object.freeze(['queue-limit', 'no-duplicate', 'require-field']);

/** Sensible defaults when a profile has no hooks.json. */
export const DEFAULT_RULES = Object.freeze([
  Object.freeze({ id: 'queue-cap', event: 'beforeEnqueue', kind: 'queue-limit', max: 100, reason: '一次最多生成 {max} 条命令。' }),
  Object.freeze({ id: 'no-duplicate', event: 'beforeEnqueue', kind: 'no-duplicate' }),
]);

export function validateRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const good = [];
  const rejected = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') { rejected.push({ rule: r, why: '不是对象' }); continue; }
    if (!KINDS.includes(r.kind)) { rejected.push({ rule: r, why: '未知规则类型 ' + String(r.kind) }); continue; }
    if (r.kind === 'queue-limit' && !(Number(r.max) > 0)) { rejected.push({ rule: r, why: 'max 必须是正数' }); continue; }
    if (r.kind === 'require-field' && !r.field) { rejected.push({ rule: r, why: '缺少 field' }); continue; }
    good.push(r);
  }
  return { rules: good, rejected };
}

const same = (a, b) => a.type === b.type && a.package === b.package
  && (a.type !== 'toggle' || Boolean(a.disable) === Boolean(b.disable))
  && (a.type !== 'anchor' || (a.anchor || '') === (b.anchor || ''));

/**
 * Evaluate one rule against a pending operation.
 * @returns {{allowed:boolean, reason:string}} - a refusal must carry a reason.
 */
export function evaluateRule(rule, op, ctx) {
  const queue = (ctx && ctx.queue) || [];
  if (rule.kind === 'queue-limit') {
    if (queue.length >= Number(rule.max)) {
      const reason = String(rule.reason || '队列已满（上限 {max}）。').replace('{max}', String(rule.max));
      return { allowed: false, reason };
    }
    return { allowed: true, reason: '' };
  }
  if (rule.kind === 'no-duplicate') {
    const hit = queue.find((q) => same(q, op));
    if (hit) return { allowed: false, reason: '队列里已经有相同的命令：' + op.type + ' · ' + op.package };
    return { allowed: true, reason: '' };
  }
  if (rule.kind === 'require-field') {
    const v = op ? op[rule.field] : undefined;
    if (v === undefined || v === null || String(v).trim() === '') {
      return { allowed: false, reason: String(rule.reason || ('缺少字段 ' + rule.field)) };
    }
    return { allowed: true, reason: '' };
  }
  return { allowed: false, reason: '无法评估的规则类型：' + String(rule.kind) };
}

/** Run rules in order; the first refusal wins. */
export function evaluateRules(rules, op, ctx) {
  for (const rule of rules || []) {
    const verdict = evaluateRule(rule, op, ctx);
    if (!verdict.allowed) return verdict;
  }
  return { allowed: true, reason: '' };
}

if (typeof window !== 'undefined') window.TurnstileHookRules = { KINDS, DEFAULT_RULES, validateRules, evaluateRule, evaluateRules };
