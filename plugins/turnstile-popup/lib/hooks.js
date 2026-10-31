// Event hooks: named interception points with before/after semantics.
//
// Shape taken from amis' editor events (beforeInsert / afterUpdate / ...): a before hook may refuse
// and must say why; an after hook observes and never blocks. Two rules we add, because both failures are
// silent otherwise:
//
//   1. a hook that throws **refuses** the action (fail closed) and the refusal quotes the error;
//   2. an unknown event name is rejected at registration, so a typo cannot become a hook nobody runs.

export const EVENTS = Object.freeze([
  'beforeEnqueue',   // about to add a command to the designer queue
  'afterEnqueue',    // a command was added
  'beforeApply',     // about to write the plan to disk
  'afterApply',      // the write finished (or failed, with ok=false)
  'beforeJump',      // about to move the history cursor
]);

export function createHooks() {
  return { handlers: new Map(), seq: 0 };
}

/** Register a handler. Returns an unsubscribe function. Unknown event names are refused. */
export function on(hooks, event, handler) {
  if (!EVENTS.includes(event)) throw new Error('unknown hook event: ' + event);
  if (typeof handler !== 'function') throw new Error('hook handler must be a function');
  const key = event + '#' + (++hooks.seq);
  if (!hooks.handlers.has(event)) hooks.handlers.set(event, []);
  hooks.handlers.get(event).push({ key, handler });
  return () => {
    const list = hooks.handlers.get(event) || [];
    const i = list.findIndex((h) => h.key === key);
    if (i !== -1) list.splice(i, 1);
  };
}

/**
 * Run the before hooks in registration order. The first refusal wins and stops the chain, because a later
 * hook cannot know the action was already refused.
 */
export function runBefore(hooks, event, payload) {
  const list = (hooks && hooks.handlers.get(event)) || [];
  let data = payload;
  for (const entry of list) {
    let verdict;
    try {
      verdict = entry.handler(data);
    } catch (e) {
      return { allowed: false, reason: '钩子抛错：' + (e && e.message ? e.message : String(e)), payload: data };
    }
    if (verdict === false) return { allowed: false, reason: '被钩子拒绝（未给出原因）', payload: data };
    if (typeof verdict === 'string' && verdict) return { allowed: false, reason: verdict, payload: data };
    if (verdict && typeof verdict === 'object') {
      if (verdict.reason) return { allowed: false, reason: String(verdict.reason), payload: data };
      if (verdict.payload) data = verdict.payload;
    }
  }
  return { allowed: true, reason: '', payload: data };
}

/** After hooks never block; their errors are collected so one bad observer cannot break the action. */
export function runAfter(hooks, event, payload) {
  const list = (hooks && hooks.handlers.get(event)) || [];
  const errors = [];
  const results = [];
  for (const entry of list) {
    try { results.push(entry.handler(payload)); }
    catch (e) { errors.push(e && e.message ? e.message : String(e)); }
  }
  return { results, errors };
}

if (typeof window !== 'undefined') window.TurnstileHooks = { EVENTS, createHooks, on, runBefore, runAfter };
