# Response to the Kimi review (2026-10-30)

The review behind `Kimi_Agent_项目评估与UI设计.zip` cloned this repo at `6a8d18d`, ran
`selftest` (39 fixture cases), read the CI config and compared the project against nine
neighbouring tools. This file records what we accept, what we reject, and the order we will
fix it in. Every claim below was re-checked against the working tree, not copied.

## Verified in the repo right now

| Review item | Claim | Our check | Verdict |
|---|---|---|---|
| P0-1 | `probe` is not a sandbox | `tools/probe.mjs` runs the plugin in `execFileSync(node, [worker])`; no fs/net/env restriction | **Accept** |
| P0-2 | state written into the package dir | `history.mjs:12` `join(root,'state','gate-history.json')`, `preflight.mjs:120`, `gate-map.mjs:129`, `doctor.mjs:110` | **Accept** |
| P1-1 | `files` typo `docsREADME.md` | actual `files` = `[tools, tests, docs, README.md, LICENSE]` - the typo is **not present** at this commit | **Reject (already fixed)** |
| P1-1 | `plugins/` missing from publish files | `files` has no `plugins` | **Accept** |
| P1-3 | `selftest` shells out to `bash -lc` | `selftest.mjs:14` | **Accept** |
| P1-2 | exit codes fragmented | risk 6 / prompt-vars 7 / probe --strict 7 / port-file-shortcut 9 / ui 11 | **Accept** |

## One the review missed, and it is worse than the `plugins/` gap

`knowledge/` is not in `files` either. `knowledge/ctx-services.json` is what `conflict.mjs`
loads to know which `ctx` services exist. Publish the package as it stands and every user gets
the degraded legacy allowlist while `plugins/` - which only runtime-truth needs - is equally
absent. So the published artefact loses **two** runtime inputs, one of them on the hot path.

## What we will not do the way the review suggests

1. **"Drop the sandbox wording or attach SES/LavaMoat"** (P0-1). SES is a browser/agent
   compartment model. On Node 22 the cheap, correct answer is the built-in permission model:
   `--experimental-permission --allow-fs-read=<plugin dir>` also denies net and writes.
   Plan: try the permission model first, fall back to today's behaviour, and record the
   evidence level as `runtime-untrusted` when we are unconfined.
2. **"Unify exit codes to 0/1/2/N>=10"** (P1-2). Sensible, but it collides with the existing
   contract that our own CI asserts (`ui-fixture` must exit **11**). Plan: keep the distinct
   codes, document the single contract `0 pass / 1 block / 2 usage / N tool-specific`, and make
   `--json` the only interface integrations are told to consume.
3. **"Add CVE/reputation scanning"** (comparison section). Agreed it is a gap, but a scanner
   that queries a network API by default changes the tool's threat model (it phones home).
   Plan: `supply-chain` is **opt-in** (`--supply-chain` or `.turnstilerc`), off by default.

## Order of work

| Phase | Items | When |
|---|---|---|
| Research and design (no runtime code) | this file, console data contract, mock-click spec | before 18:00 |
| Packaging and honesty | `files` += `plugins`, `knowledge`; state dir out of the package; probe env cleared; README boundaries | after 18:00 |
| Contract and safety | probe permission model; exit-code doc; `.turnstilerc` | after 18:00 |
| New capability | `supply-chain` (opt-in, OSV), scan-coverage self-report | after 18:00 |
| Console + E2E | real-data console; mock-click plugin driving the panel with real clicks | after 18:00 |

## Standing rule

The gate grows by adding checks and their counter-examples, never by loosening an existing
one. Every item above lands with a fixture that fails when the fix regresses.
