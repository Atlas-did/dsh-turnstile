# .turnstilerc: one place for the numbers (design)

Today these are hardcoded in five files. The Kimi review flagged it (P2-1/P2-2); this fixes the
shape before the code moves.

## File

`<profile>/.turnstilerc` (JSON; YAML would need a parser the tool does not otherwise require).
Absent file = defaults. Unknown keys = error, because a typo in a gate config must not be
silently ignored.

    {
      "officialScopes": ["@deepseek-ai/"],
      "ui":        { "threshold": 10 },
      "timeouts":  { "check": 30000, "probe": 9000 },
      "probe":     { "isolation": "auto", "allowNet": false },
      "supplyChain": { "enabled": false, "osvUrl": "https://api.osv.dev/v1/query",
                       "maxPackages": 200 },
      "scan":      { "maxDepth": 2, "maxFiles": 40 }
    }

## Precedence

CLI flag > environment variable > `.turnstilerc` > built-in default.

| Setting | Flag | Env |
|---|---|---|
| `timeouts.check` | `--timeout` | `DSH_CHECK_TIMEOUT` |
| `ui.threshold` | `--ui-threshold` | `DSH_UI_THRESHOLD` |
| `probe.isolation` | `--no-probe-isolation` | `DSH_PROBE_ISOLATION` |
| `supplyChain.enabled` | `--supply-chain` | `DSH_SUPPLY_CHAIN` |

## Why `officialScopes` matters

`risk.mjs` currently hardcodes `@deepseek-ai/` as "the official scope". A fork, a private
registry mirror, or a re-branded host makes that constant wrong and the whole RED/AMBER
classification wrong with it. It is one array, and it belongs in config.

## Deliberately not configurable

- Exit codes. They are a contract, not a preference.
- Whether a failed checker blocks. That is a property of the check (advisory or not), decided in
  `preflight.CHECKS`, not by the user.
- The evidence level vocabulary. If users could rename it, the console could not compare runs.

## Test

    tests/config-fixture/  .turnstilerc with ui.threshold=2, officialScopes=["@acme/"]
    -> ui-surfaces must go red at 3 plugins (not 10)
    -> risk must treat @acme/* as official
    -> an unknown key must exit 2 with the key named

The third assertion is the one that keeps the file honest: a config that silently ignores
typos is worse than no config.
