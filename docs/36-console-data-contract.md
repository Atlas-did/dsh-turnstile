# Console data contract (design, pre-implementation)

The console the review proposes merges `doctor` + `gate-map` + `report.json`. Before writing
any UI, this fixes what a single fetch must return, and which existing tool already produces
each field.

## What report.json v1 has today

    { profile, generatedAt, runtimeTimeoutMs, checks[], blocking[], result, exit }
    checks[]: { name, ok, exit, ms, timedOut, structured, findings[], summary }

Measured on mini: 12 checks, 40 findings (22 css-collision + 17 ui-placement + 1 engine-gate).

## Gaps that block the console

| Console needs | Present today | Source to wire in |
|---|---|---|
| blocking vs advisory per check | no - only a flat `blocking[]` list | `preflight.CHECKS[].advisory` |
| evidence level per finding (data/resolve/ast/text/runtime) | no | each checker already prints it; put it in the envelope |
| override chain (who wrote a row last) | no | `gate-map.mjs` already computes it |
| UI crowding per surface | only counts inside findings | `ui-surfaces.mjs` surface table |
| plugin inventory (disabled / engine skip / row id) | no | `manage.mjs --json` |
| runtime snapshot (active entries, provides) | no | `state/runtime-<profile>.json` from the probe |
| gate timeline | separate file | `state/gate-history.json` |

## Proposed report.json v2

    {
      "schema": "turnstile/report@2",
      "profile": "...", "generatedAt": "...", "result": "clear|blocked", "exit": 0,
      "checks": [{ "name", "ok", "advisory", "exit", "ms", "timedOut",
                   "evidence": "ast|text|runtime|data", "findings": [
                     { "severity", "plugin", "resource", "message", "evidence", "fix" } ] }],
      "overrides": [{ "id", "winner", "file", "layers" }],
      "uiSurfaces": [{ "surface", "count", "plugins", "overThreshold" }],
      "plugins": [{ "name", "version", "disabled", "engineSkipped", "row", "ui" }],
      "runtime": { "pid", "active", "total", "appliedAtUptimeSeconds", "providedAtRuntime" },
      "history": [{ "at", "result", "exit" }]
    }

Rules: every array is optional (a missing section renders as an empty panel, never as an
error); `schema` is bumped when a field changes meaning; the console never invents data -
if a section is absent it says so on screen.

## Why one file and not five calls

The console must work when the host is **running but unhealthy** - that is exactly when a user
opens it. Five separate CLI spawns behind a request is both slow and failure-prone; regenerating
one JSON from in-process functions is not. So the plumbing is: refactor each checker's data path
into a function, have both the CLI and the console call the function.

## Non-goals for v2

- No live streaming in the first version (poll the report, add a reload button).
- No write actions from the console except the existing toggle, which already has a dry-run
  and a backup - anything else stays in the CLI where it is reviewable.
