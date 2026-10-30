# Acceptance on the real mini profile (2026-10-31)

Everything below was run against the live lab profile, not a fixture. Two parts: read-only
observation, then one reversible write round trip.

## Part 1: read-only

| Route | Result |
|---|---|
| `GET /turnstile/console` | 200, page renders |
| `GET /turnstile/console-data` | 200, JSON |
| `GET /turnstile/plugins` | 200 |
| `GET /turnstile/occupancy` | 200 |
| `GET /turnstile/activity` | 200 |
| `POST /turnstile/designer` without a POST body | 405 (as designed) |

The console page against the live profile reports:

    插件 28 · UI 占用 14 · 深层架构 1226 节点 · 历史 40 条

No browser errors. Source: `state/mini-console-real.png`.

## Part 2: one reversible write round trip

Target: the `dsh-context` row, which was disabled before the test and is disabled after it.

| Step | Result |
|---|---|
| patch sha256 before | `248ff6e3810389c4…` |
| plan for enable | `confirm: apply 4a56633746d1` |
| apply with that token | `applied: true` |
| patch sha256 after enable | `4a56633746d169c9…` |
| plan for disable | new token |
| apply | `applied: true` |
| patch sha256 after re-disable | `248ff6e3810389c4…` **byte-identical to the original** |

Two `.bak-<epoch-ms>` files were created, one per write.

The durable journal recorded both operations:

    applied  toggle:dsh-context=on
    applied  toggle:dsh-context=off

## What this does and does not prove

Proven: the routes serve the real profile; a write goes plan -> confirm -> atomic replace; the
reverse write restores the file byte for byte; the journal keeps a record.

Not proven here: that the harness **picked up** the change. A restart is required for that, and the
profile is back in its original state, so the acceptance stopped at the file level. Runtime effect is
a separate check (`quicktest` was run afterwards and reports all checks passed, but that is health,
not proof that a disabled plugin was actually skipped).

## Health after the round trip

`quicktest mini 18770 mini` -> all checks passed. The profile is byte-identical to how it was found.
