# Hook rules: the profile owns them, the page evaluates them (P0-5 finished)

docs/75 shipped hooks inside the page: the queue cap and duplicate detection were closures in
`console-designer.js`. That made them untouchable from outside - a profile owner could not add a rule, and
the host could not see them. This round moved the *rules* into data.

## Shape

```
host:  GET /turnstile/hooks -> { rules, rejected, source }
       reads <state>/hooks.json; falls back to DEFAULT_RULES
page:  fetchHookRules() once, then a single beforeEnqueue hook evaluates them
```

Rule kinds (`lib/hook-rules.js`), each with its own refusal text:

| kind | refuses when |
|---|---|
| `queue-limit` | the queue reached `max` (default 100) |
| `no-duplicate` | an identical command is already queued |
| `require-field` | the named field is empty (e.g. an anchor) |

An unknown kind is **rejected at load** with a reason rather than ignored, so a typo cannot silently
disable a rule. `test/hook-rules.test.mjs` - 7 checks (defaults valid, unknown kind rejected, cap quotes
the number, duplicate is strict about `disable`/`anchor`, require-field names the field, first refusal
wins, empty rules allow).

## Proof that a profile rule actually changes behaviour

`tools/e2e-hook-rules.mjs` writes `<state>/hooks.json` with one rule:

```json
{ "rules": [{ "id": "cap-1", "event": "beforeEnqueue", "kind": "queue-limit", "max": 1,
               "reason": "这个 profile 只允许一条命令。" }] }
```

then drives the real page:

```
ok  the host reports the profile rule          source: state/hooks.json, 1 rule
ok  the rule stops the second command          1 -> 1 queue entries
ok  the refusal quotes the profile rule        这个 profile 只允许一条命令。
```

That is the difference between "hooks exist" and "hooks are an extension point": the page never mentions
`max: 1` - it came from the profile.

## Bugs this round hit

1. **The page briefly had no rules.** Moving the checks out removed the duplicate detection from the
   fallback path, so when the fetch had not resolved yet a duplicate was accepted. Fixed by seeding
   `ds.hookRules` from `DEFAULT_RULES` synchronously.
2. **The test server read the wrong file.** It looked at `<repo>/state/hooks.json` instead of the
   profile's state dir, so the profile rule was invisible. Found because the new e2e printed
   `source: defaults` when it should have printed `state/hooks.json`.

## Still not done

Rules are declarative data. There is no way for another **plugin** to register an arbitrary JS hook -
that would need a host-side service registry, which does not exist yet. What exists is: the profile owner
can add or change rules without touching code.
