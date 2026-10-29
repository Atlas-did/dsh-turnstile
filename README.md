# dsh-turnstile

**Install-time gate and sandbox for DeepSeek Harness plugins.** Catch a plugin before it breaks your environment.

Every plugin must pass through one at a time — like a turnstile.

---

## Why this exists

A single plugin can take the whole harness down, and the failure is usually silent.

Real case from building this tool: a preset bundle declared a prompt variable `{{cwd}}`
that the runtime never registers. Nothing happens at boot. The host starts fine, the UI loads fine —
and then the **first conversation** throws:

```
unknown prompt variable "{{cwd}}" in section "deployment:persona-prefix"
```

A second real case: the desktop build ships an inspector channel with a byte budget
(`maxSourceFrameBytes - 4096`). A configuration that grew past it killed the host with
`inspector: source state exceeds the source-frame byte limit` — and afterwards you simply
could not create a new conversation. The web/CLI build never shows this, so it passes every local test.

Both are findable **before** installing anything, if you check the right surfaces.

---

## 30 seconds

```bash
git clone https://github.com/Atlas-did/dsh-turnstile.git
cd dsh-turnstile
npm install                # js-yaml only

# check an existing profile (needs a DSH install, see below)
DSH_HOME=~/.dsh node tools/preflight.mjs ~/.dsh/profiles/desktop

# or prove the scanners still work first — this never touches your profile
node tools/selftest.mjs
```

`preflight` exits `0` when clear, `1` when at least one blocking check fires.

Point it at a real DSH install: `DSH_BIN=/path/to/@deepseek-ai/dsh/lib/bin.js`
(auto-detected from `node_modules`, `runtime/node_modules`, and the global npm prefix).

---

## What each check catches

| Check | Fires when | Real consequence if ignored |
|---|---|---|
| `dependency-risk` | a plugin imports a peer-only, non-official package | module resolution fails at load; the plugin never runs |
| `conflict-surface` | two plugins assign the same `ctx` service, or a dependency version forks | one plugin silently overwrites the other's service |
| `engine-gate` | `engines.dsh` excludes the running version | **drop-style**: the plugin is skipped with no error at all |
| `prompt-vars` | a persona section uses a variable the runtime does not register | first conversation throws; boot looks fine |
| `import-health` | a module cannot be resolved even before restart | host boots, plugin is dead |
| `ui-surface` | more than N plugins inject the same UI surface | settings pages pile up; users cannot find anything |

Advisory (never blocking): version matrix (`OK` / `SKIPPED` / `UNCERTIFIED` / `EXEMPTED`), stale decisions,
and drift — bundles added since the last gate run.

## The UI threshold is a capacity limit, not an aesthetic complaint

```
node tools/ui-surfaces.mjs <profileDir>        # default threshold 10
DSH_UI_THRESHOLD=8 node tools/ui-surfaces.mjs <profileDir>
```

It prints every UI surface with the plugins injecting it, and exits `11` when a surface
goes **above** the threshold. In a real desktop profile we measured one settings surface
injected by **10** plugins, and nine surfaces at three or more.

---

## See the whole picture

```bash
node tools/doctor.mjs <profileName>                    # one table: bundles, disables, gate history, model routes, UI, engine skips
node tools/gate-map.mjs <profileName>                  # interactive HTML: topology + audit trail
node tools/mapshot.mjs state/gate-map-x.html out.png   # headless screenshot (needs playwright-core + Edge)
```

`gate-map` answers the questions that are impossible to answer by reading config files:

- **who overwrote this row, and where** — every row id that appears in more than one layer, with the winning layer and the file path
- **which UI surface is crowded** — plugin → surface edges, thick and red above the threshold
- **where it broke** — the last 40 gate runs with the check that blocked them

Plugin nodes and file paths are clickable `vscode://file/...` links, so the report takes you to the line.

---

## Boundaries (read this before trusting it)

1. **Static checks only.** Nothing here instruments the runtime. A clean report means "no known failure surface", not "proven working".
2. **`UNCERTIFIED` is registered, not verified.** The version matrix records what a plugin declares; it does not prove compatibility.
3. **The gate is DSH-shaped.** It understands `cordis.patch.yml` arrays and `--dump-config`. A major harness change needs an adapter.
4. **Row-id scope is per parent group.** The same id in two presets is legal; reporting it as a conflict is a false positive. This tool matches the harness's own scope rules.
5. **No auto-fix.** Findings name the file and the fix; changing your profile stays your call.

---

## Every scanner ships with a fixture that must fail

A green result means nothing if the scanner is broken. `tools/selftest.mjs` runs each scanner
against a fixture that is **supposed** to trip it:

```
PASS  risk catches RED fixture              exit=6
PASS  ui-surface blocks crowded fixture     exit=11
PASS  preflight blocks the fixture          exit=1
RESULT: gate is healthy (11 cases)
```

Add a check, add its fixture. A scanner without a failing fixture is not trusted here.

---


---

## Known limits, and what this repo does about them

A gate that hides its blind spots is worse than no gate. These are real, measured compromises.

| Limit | Status | Evidence |
|---|---|---|
| Most checks were text heuristics | **Mostly fixed** | Imports and `ctx.*` now go through a real tokenizer/parser (`es-module-lexer` + `acorn`), with regex only as fallback, and `evidence: ast|text` is printed. Still heuristic: `{{var}}` prompt scanning and `dsh.client.inject` reading. Dynamic registration is covered by the runtime probe instead. |
| Version rules were re-implemented by hand | Fixed here | `tools/version.mjs` delegates to the host's own `evaluatePluginCompatibility`; fallback is `semver` with includePrerelease. For `^0.2.0-rc.1` vs `0.2.1-rc.3`, plain `semver.satisfies` says false, the host says true. Only the host is authoritative. |
| `semver` / core-service knowledge is hand-maintained and drifts | Partly open | Version rules no longer drift (delegated). The known-ctx-service allowlist is still a constant; next step is generating it from the installed runtime and failing loudly when the runtime version has no knowledge file. |
| Deeply tied to DSH internals | By design | It understands `cordis.patch.yml`, `--dump-config` and the inspector byte budget. Another harness needs an adapter, not a flag. |
| `selftest` reported "healthy" while skipping environment cases | Fixed here | Summary now separates fixture from environment coverage, and `--strict` exits 4 when anything was skipped. A green line no longer means two different things. |

### What a green report actually means

```
fixture cases passed  -> the scanners still catch what they must catch
environment cases     -> your profiles were really scanned (needs DSH_HOME)
skipped               -> neither; coverage you did not get
```

### Trust levels (planned)

| Class | How it was found | Strength |
|---|---|---|
| data | read from package.json / --dump-config | high |
| resolve | the module was actually resolved | high |
| ast | parsed with es-module-lexer / acorn | high |
| text | regex over source (fallback only) | medium |
| runtime | observed in a live host | highest (not implemented) |

---

## Exit codes (so a green line cannot lie)

| Code | Meaning |
|---|---|
| `0` | every case ran and passed — full coverage |
| `1` | at least one case failed |
| `3` | no failures, but coverage was partial (environment cases skipped) |
| `4` | `--strict`, and coverage was partial |

`--allow-skips` downgrades `3` back to `0` on purpose — use it in CI, where no DSH install
exists, so the fixture checks stay meaningful instead of silently claiming full coverage.

```bash
node tools/selftest.mjs                # local: 3 if any environment case could not run
node tools/selftest.mjs --allow-skips  # CI: fixtures only, still fails on a broken scanner
node tools/selftest.mjs --strict       # release gate: skip anything and it fails
```

---

## The runtime probe (the only check that sees dynamic code)

Static scanners read text. A plugin can register a service under a computed name and every
regex in this repo will miss it. `probe` does not read: it **applies the plugin against a
stub ctx** and records what actually happened.

```bash
node tools/probe.mjs <profileDir>            # advisory: reports static blind spots
node tools/probe.mjs <profileDir> --strict   # exit 7 when the probe saw something static missed
```

Real output on a fixture whose service name is assembled at runtime:

```
PLUGIN          STATUS   PROVIDED      MISSED-BY-STATIC
plug-dynamic    ran      sharedStore   sharedStore
ran 1/1   static blind spots: 1
STRICT: 1 plugin(s) registered something the static scan missed   (exit 7)
```

On a real profile most plugins report `import-error` or `apply-error` — they need host
services the stub does not provide. That is not a failure of the probe: it is the measured
answer to "what does this plugin actually need?", which static scanning cannot give you.

| Probe status | Meaning |
|---|---|
| `ran` | applied cleanly against the stub; `provided` / `assigned` are observed facts |
| `apply-error` | reached `apply()` but needed a real service (the error names it) |
| `import-error` | could not even load — usually a host-provided module |
| `timeout` / `killed` | exceeded the budget; the child process is killed, the scan continues |

Each plugin runs in its own child process, so a hang or a crash cannot take the scan down.

---


### What each scanner actually uses

| Scanner | Evidence | Can be fooled by |
|---|---|---|
| `risk` (imports) | ast via es-module-lexer | computed specifiers: `import(name)` |
| `conflict` (ctx writes / provides) | ast via acorn | `ctx[key] = ...` with a computed key |
| `conflict` (known services) | data: generated from the installed runtime's `interface Context` augmentations | a runtime whose d.ts lie about what it provides |
| `engines` / `version` | host evaluator (`evaluatePluginCompatibility`) | nothing — it is the host's own rule |
| `prompt-vars` | text | variable names assembled at runtime |
| `ui-surface` | data: `dsh.client.inject` + patch rows | UI injected from code instead of the manifest |
| `probe` | runtime: applied against a stub ctx | anything that needs a real service before it registers |

---

## Adding a check

1. Write `tools/your-check.mjs` — take a profile dir, exit `0` on clear, non-zero on findings.
2. Add `tests/your-fixture/` that **must** make it fail.
3. Register the case in `tools/selftest.mjs`.
4. Add one line to the table in `tools/preflight.mjs`.

The gate grows by adding checks and their counter-examples, never by loosening an existing one.

---

## Docs

| File | Content |
|---|---|
| [`docs/21-preflight-gate.md`](docs/21-preflight-gate.md) | the gate contract: what blocks, what only advises |
| [`docs/26-provider-map.md`](docs/26-provider-map.md) | model routes and the duplicate-id failure that breaks the default model |
| [`docs/30-gate-map.md`](docs/30-gate-map.md) | the visual audit trail, and the scope bug that made it lie once |

## License

MIT.