# Fixture skeletons laid down before the code (research phase)

Fixtures first, tool second: the acceptance criteria live in the fixtures, so the implementation
cannot drift into what was convenient to build.

## `tests/config-fixture`

Three plugins (`cfg-a/b/c`) each injecting `@deepseek-ai/dsh-client-ui-settings`, plus:

    .turnstilerc = { officialScopes: ['@acme/'], ui: { threshold: 2 } }

Expected, once `.turnstilerc` is honoured:

| assertion | why it fails today |
|---|---|
| `ui-surfaces` goes red at **3** plugins | default threshold is 10, so nothing fires |
| `@acme/*` counts as official in `risk` | the official scope is hardcoded to `@deepseek-ai/` |
| an unknown key in `.turnstilerc` exits 2 and names the key | there is no config reader at all |

The third one is the reason the fixture exists: a config file that silently accepts typos is
worse than no config file, because the user believes it took effect.

## `tests/supply-chain-fixture/{vulnerable,clean,malformed}`

Each is a profile plus a **recorded OSV response** (`osv-response.json`), so the checker can be
tested with no network:

| fixture | recorded response | required outcome |
|---|---|---|
| `vulnerable` | one vuln `GHSA-xxxx-yyyy-zzzz` for the dependency | exit 6, one error finding carrying that id |
| `clean` | `{ results: [{ vulns: [] }] }` | exit 0, zero findings |
| `malformed` | `{ error: 'HTTP 502', status: 502 }` | **exit 2**, never a pass |

The malformed case is the one that matters. Treating "the API failed" as "no vulnerabilities"
is precisely the false green this project exists to prevent, and it is the default behaviour of
most naive scanners.

## Invariants the fixtures assume

1. Recorded responses are keyed by package name, so one fixture can mix multiple dependencies;
2. The checker never writes to the profile (read-only, like every other check);
3. `--osv <file>` and `DSH_OSV_FIXTURE=<file>` are the only ways to point it at a recording;
   live queries require `supplyChain.enabled` or `--supply-chain`, and say so in the output.

## Status

Skeletons committed; **no tool reads them yet**. Wiring them up is the post-19:00 work, and the
first commit that touches `supply-chain.mjs` must turn these three into passing selftest cases
in the same commit - a checker without its failing fixture is not done.
