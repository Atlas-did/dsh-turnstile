# turnstile-popup

An install-time gate and plugin inspector for DeepSeek Harness.

It adds a settings page (`设置 → 插件体检`) and a full-page console (`/turnstile/`) that answer four
questions: is this profile healthy, who occupies which part of the interface, can a plugin be
repositioned, and what did the last check change.

## Install

This package lives inside a toolkit repository. From the repository root:

```bash
node tools/setup.mjs --home ~/.dsh --profile <profile> --panel --yes
```

That copies the package into the profile's `node_modules`, appends the bundle entry and a
`cordis.patch.yml` row, and keeps a `.bak` of every file it touches. Restart the harness afterwards.

Or install it like any bundle:

```bash
pnpm add file:<repo>/plugins/turnstile-popup
```

## Use

- **Settings page**: `Ctrl+Alt+,` → 插件体检 → 概览 / 架构图 / 占用 / 插件 / 控制台.
- **Full page**: open `/turnstile/?token=<session token>` in a browser tab. The token is the same one
  the harness prints on startup.

## Uninstall

```bash
node tools/lab.mjs <profile> --uninstall turnstile-popup
```

Removes the package directory, the dependency entry, the bundle entry and the patch row.

## Compatibility

Tested on DeepSeek Harness `0.2.1-rc.3` (Windows). Newer releases are declared `unknown` in
`dsh.compatibility.dshReleases` rather than claimed compatible.

## What it does not do

It reads profile files and writes its own reports under `state/`. No telemetry, no network call at
runtime. It never modifies another plugin's rows.
## Verification status

Four states, never blurred:

| State | Meaning here |
|---|---|
| **verified** | ran on a real harness profile and the result was observed |
| **partial** | source and tests pass, runtime not observed (this package today) |
| **blocked** | a hard gate fails; nothing is claimed |
| **unverified** | not attempted yet |

Current record:

| Item | State | Evidence |
|---|---|---|
| Static contract (mutation discipline, tests, host contract) | verified | `npm test`, store auditor 73/80 static |
| Install / start / uninstall on a disposable profile | verified | lab profile round trip, DSH 0.2.1-rc.3, Windows |
| Other DSH releases (0.2.1-rc.4, 0.2.1-rc.5, 0.2.2-alpha.2) | unverified | declared `unknown` in `dsh.compatibility` |
| Desktop UI acceptance | unverified | CLI results are not desktop evidence |

**Next gate:** run the install/start/uninstall round trip once per declared DSH release on a disposable
profile, then move each `unknown` to `compatible` or `incompatible` with a linked receipt.

## Mutation discipline

Every write to a profile goes through `lib/txn.js`:

    plan (file, before/after sha256, confirm token) -> exact confirmation -> precondition check
      -> lock file -> atomic rename -> post-write verify -> health check -> rollback on failure

Each operation is recorded in `state/turnstile-journal.json` before it touches a file. A process that
dies mid-write leaves a `started` entry plus a `.tmp-` file; the next start marks it
`recovery-required` instead of retrying silently.
