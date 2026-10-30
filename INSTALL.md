# Installation

`dsh-turnstile` runs **outside** the harness: it reads a profile directory and reports on it.
Nothing is installed into DeepSeek Harness itself, and no command below changes a profile
unless it is explicitly asked to (`--apply`, `--yes`).

## Requirements

- Node.js 20 or newer (developed and tested on Node 24/25);
- a DeepSeek Harness installation, for the version-compatibility check to be authoritative;
- optional: `playwright-core` plus Microsoft Edge (or Chrome) for the screenshots and the
  browser end-to-end test. Everything else works without a browser.

## 1. Get the code

```bash
git clone https://github.com/Atlas-did/dsh-turnstile.git
cd dsh-turnstile
npm ci          # or: npm install
```

The tools also run straight after `git clone` without installing, because dependencies are
resolved from a nearby DSH runtime when the local `node_modules` is missing.

## 2. Point it at a profile

A profile is a directory containing `package.json` (with `dsh.profile.bundles`) and
`cordis.patch.yml`. Common locations:

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.dsh\profiles\<name>` |
| macOS / Linux | `~/.dsh/profiles/<name>` |

```bash
node tools/preflight.mjs ~/.dsh/profiles/desktop
```

If `DSH_HOME` is set, the tools can also auto-detect the profile:

```bash
DSH_HOME=~/.dsh node tools/manage.mjs --list
```

## 3. Verify the gate itself

```bash
node tools/selftest.mjs               # 3 = coverage incomplete (no DSH installed here)
node tools/selftest.mjs --allow-skips # CI mode: fixture checks only
node tools/selftest.mjs --strict      # release gate: any skip fails
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | everything ran and passed |
| 1 | at least one blocking finding |
| 2 | usage error (bad path, bad flag, unknown config key) |
| 3 | no failure, but coverage was incomplete (something could not run) |
| 4 | `--strict` and coverage was incomplete |

Individual checkers keep their own codes (`6` dependency risk, `7` prompt variables, `9` resource
conflicts, `11` UI crowding). Integrations should read `--json` rather than map exit codes.

## 4. Optional: the management panel

The panel is a normal DSH plugin (host half + client half). Install it into a profile you are
willing to experiment in - never straight into a production profile:

```bash
node tools/setup.mjs --home ~/.dsh --profile <name> --panel --yes
```

This copies `plugins/turnstile-popup` into the profile's `node_modules`, appends the bundle entry
and a `cordis.patch.yml` row, and keeps a `.bak` of every file it touches. Restart DSH to load it.

## 5. Optional: the mini-lab skill

```bash
mkdir -p ~/.dsh/skills/mini-lab
cp skills/mini-lab/SKILL.md ~/.dsh/skills/mini-lab/
```

Then type `/mini` in the composer to enter the lab workflow.

## Uninstalling

```bash
node tools/lab.mjs <profileDir> --uninstall turnstile-popup
```

This removes the package directory, the `dependencies` entry, the bundle entry and the patch row.
Every write the tools perform leaves a `<file>.bak-<timestamp>` next to the original, so any
change can also be reverted by hand.

## Privacy

The tools read profile files and write their own reports under `state/` (gitignored). Nothing is
sent anywhere: there is no telemetry, no network call, and no account. `--supply-chain` is the
only opt-in network feature and it is off by default.
