# Event hooks: before may refuse and must say why (P0-5)

Shape taken from amis' editor events (Apache-2.0 - the interception points only, no code). Two rules were
added because both failures are silent otherwise:

1. **a hook that throws refuses the action** (fail closed) and the refusal quotes the error;
2. **an unknown event name is rejected at registration**, so a typo cannot become a hook that never runs.

## Module

`lib/hooks.js`:

```js
EVENTS = ['beforeEnqueue', 'afterEnqueue', 'beforeApply', 'afterApply', 'beforeJump']
createHooks()
on(hooks, event, handler)      // returns unsubscribe; throws on unknown event
runBefore(hooks, event, payload) // { allowed, reason, payload } - first refusal wins
runAfter(hooks, event, payload)  // { results, errors } - never blocks
```

`test/hooks.test.mjs` - 8 checks: allow by default, refusal stops the chain, a bare `false` still yields a
reason, a throwing hook refuses with the message, a hook may rewrite the payload, after-hooks never block
and collect errors, unsubscribe works, misspelled event refused.

## Wired into a real decision

The designer's queue rules moved into a `beforeEnqueue` hook, so the palette and the batch path share one
decision:

```js
if (ds.operations.length >= 100) return '一次最多生成 100 条命令。';
if (same) return '队列里已经有相同的命令：' + cmd.type + ' · ' + cmd.package;
```

`addOperation` now goes through `enqueue(op)`, which runs the before hook, refuses with a notice, and
runs the after hook on success. Duplicate detection is new behaviour, not a refactor: previously clicking
`停用插件` twice queued two identical commands.

Designer e2e 37 -> **39/39**:

| Check | Evidence |
|---|---|
| a before hook refuses the duplicate command | queue stays at 1 after a second click |
| the refusal names the duplicate | notice contains `已经有相同的命令` |

## Honest gaps

* Only `beforeEnqueue` / `afterEnqueue` are used. `beforeApply`, `afterApply` and `beforeJump` are declared
  but nothing calls them yet - the apply path still validates through the route, not through a hook.
* Hooks are registered in the page, not by plugins. A plugin-facing registration API would need the host
  to own the registry; not started.
