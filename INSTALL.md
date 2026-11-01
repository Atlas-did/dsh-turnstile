# Installation

`dsh-turnstile` can run outside the harness and inspect a profile directory. The panel is optional:
ordinary users can work through the DSH agent instead of opening a terminal or a dashboard.

## Requirements

- Node.js 22.19+ or 24+ (see `package.json`).
- A DSH installation for authoritative runtime compatibility checks.
- Optional: `playwright-core` plus Edge or Chrome for browser screenshots and e2e tests.

## 1. Get and verify the code

```bash
git clone https://github.com/Atlas-did/dsh-turnstile.git
cd dsh-turnstile
npm ci

# Self-contained fixtures only; does not inspect or change your profile
node tools/selftest.mjs --allow-skips
node tools/release-check.mjs --json
```

Use `node tools/selftest.mjs --strict` as a release gate when the real DSH environment is available.
Any skipped environment case then fails instead of being hidden by a green summary.

## 2. Select a profile

A profile normally contains `package.json` and `cordis.patch.yml`:

| Platform | Typical location |
|---|---|
| Windows | `%USERPROFILE%\.dsh\profiles\<name>` |
| macOS / Linux | `~/.dsh/profiles/<name>` |

Start with read-only checks:

```bash
node tools/turnstile.mjs doctor <profile> --json
node tools/turnstile.mjs gate <profile> --json
node tools/turnstile.mjs ask <profile> "Check my plugin status" --json
```

`DSH_HOME` may point to the DSH home containing `profiles/`. `DSH_BIN` may point to the actual
`@deepseek-ai/dsh/lib/bin.js` when runtime auto-detection is insufficient.

## 3. Use the conversation entry

Install `skills/turnstile/SKILL.md` as a DSH skill. The user can then ask for status, preinstall risk,
page creation, trial evidence, repositioning, enable/disable, and snapshots in natural language.

The agent reads `actions[]`. Read-only actions may run; `open-builder` opens `/turnstile/builder`;
mutating actions must enter the unified dry-run/token flow.

## 4. Optional panel, console, and builder

Install the panel only into an experimental profile:

```bash
node tools/setup.mjs --home ~/.dsh --profile <name> --panel --yes
```

This copies `plugins/turnstile-popup`, updates the bundle and patch declarations, and keeps backups.
Restart DSH to load it. The console provides inspection and the page builder provides save, restore,
preview, export, and isolated-module verification.

## 5. Optional mini observation

The host observer does **not** start or stop mini. Record `before`, perform a controlled restart through
an authorized workflow, then record `after`:

```bash
node tools/host-observe.mjs before <profile> <pkg> --mini <miniDir> --out observation.json
node tools/host-observe.mjs after <profile> <pkg> --mini <miniDir> --input observation.json --out evidence.json
node tools/host-evidence.mjs evidence.json --record --state <stateDir>
node tools/turnstile.mjs trial-status <profile> --json
```

A static pass, an isolated-module pass, or HTTP health alone is not real-host loading evidence.

## Writes and exit status

Unified writes require a dry-run, a one-time apply token, and explicit user confirmation. High-risk disable
also requires `--confirm <package>` matching the target exactly. Do not bypass this with legacy `--yes` calls.

Integrations should read JSON rather than depend on historical checker-specific exit codes. The unified
report uses `verdict`: `ok`, `warn`, `fail`, or `unknown`. Unknown means evidence is missing, not success.

## Uninstalling the panel

```bash
node tools/lab.mjs <profileDir> --uninstall turnstile-popup
```

Review the plan and target before confirming any removal. Backups and snapshots remain separate evidence;
keep them until the environment has been checked after restart.

## Privacy and network behavior

There is no telemetry or account integration. Most checks are local. The host observer makes explicit
loopback HTTP requests to the selected mini. Optional supply-chain checks and package installation may use
the network only when requested. Observation and evidence files do not store the mini URL token.
