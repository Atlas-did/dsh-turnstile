# report.json v2: implementation plan (field by field)

Written before touching code. Each row names the file to change, the function to extract, and
the check that proves it. Measured state: all 12 checkers are **script-style** (no exports),
`grep -c '^export ' tools/<checker>.mjs` = 0 for risk, conflict, engines, ui-surfaces, port-scan.

## Step 0 - one shared shape

`tools/checker.mjs` (new):

    export async function runChecker(fn, dir)  // wraps timing, timeout marker, evidence level
    export function finding({severity, plugin, resource, message, evidence, fix})

Every checker then exports `collect(dir, opts)` returning `{checker, status, evidence, findings}`
and its CLI half becomes 10 lines: parse args -> collect -> emitJson or human table -> exit code.

Why: the console must call these **in process**, and a 12x spawn per panel refresh is both slow
and the wrong failure mode when the host is already unhealthy.

## Field ownership

| Contract field | Source today | Change | Test |
|---|---|---|---|
| `checks[].advisory` | `preflight.CHECKS[].advisory` | copy into the report entry | selftest asserts engine-gate is advisory |
| `checks[].evidence` | printed as text (`import evidence: ast`) | return it from `collect()` | risk fixture must report `ast`, not `text` |
| `findings[].evidence` | partly in messages | explicit `{file, line, kind}` | ast fixture: commented import absent |
| `overrides[]` | `gate-map.mjs` (inline) | extract `collectOverrides(profileDir)` | desktop must show exactly 2 overrides |
| `uiSurfaces[]` | `ui-surfaces.mjs` (inline loop) | export the surface table | ui-fixture: 1 surface, 11 plugins |
| `plugins[]` | `manage.mjs --json` (already JSON) | reuse as-is | manage fixture: row ids unchanged |
| `runtime{}` | probe snapshot file | read + attach when present | mini: active/total present |
| `history[]` | `state/gate-history.json` | read last 40 | history fixture |

## Order of extraction

1. `risk` and `engines` (small, and they already compute structured rows)
2. `ui-surfaces` and `slot-scan` (pure tables)
3. `port/file/shortcut/css` (already `collect`-shaped after the shared `plugin-sources.mjs` refactor)
4. `conflict`, `prompt-vars`, `import-health` (biggest; do them last, behind the others' tests)
5. `preflight` finally composes the report from `collect()` calls and writes v2

Invariant to preserve: **the CLI output and exit codes must not change** while this happens -
the existing 39 fixture cases are the regression net, and CI asserts `ui-fixture` exits 11.

## supply-chain: offline-testable by design

A network-dependent check cannot be tested in CI. So:

    node tools/supply-chain.mjs <profile> --osv <file.json>   # replay a recorded response
    DSH_OSV_FIXTURE=<file.json>                               # same thing for tests
    default (no flag): live OSV query, opt-in only

Fixtures:

| fixture | contents | must produce |
|---|---|---|
| `supply-chain-fixture/vulnerable` | dep + recorded OSV hit (CVE-2021-23337 shape) | 1 error finding with the CVE id |
| `supply-chain-fixture/clean` | same shape, recorded empty response | 0 findings, exit 0 |
| `supply-chain-fixture/malformed` | recorded 500/timeout body | exit 2 (usage/network), never a silent pass |

That third fixture matters most: a scanner that treats "API failed" as "no vulnerabilities"
is the exact `false green` this project exists to prevent.
