# Keeping the running copy honest: `tools/sync-live.mjs`

Twice in this project the repository was correct while the harness ran something older:

- docs/67: a `<script>` tag was reverted out of `console.html` but the tests still passed, because the
  page under test was built earlier;
- docs/68: the row-leak fix looked broken, because the profile loads `research/turnstile-popup/` (a
  link) and that directory had not been re-synced.

Both times the conclusion drawn was wrong for a while, and both times the cause was the same: **the
repository is not the running system**. A tool is cheaper than a third occurrence.

## What it does

```bash
node tools/sync-live.mjs <profileDir> --check   # report drift, exit 1 if any
node tools/sync-live.mjs <profileDir>           # copy the drifted files
node tools/sync-live.mjs <profileDir> --json    # same, machine readable
```

It compares a fixed list of plugin files (15 today) between `plugins/turnstile-popup/` and
`<profile>/node_modules/turnstile-popup/`, prints the real path it resolved (so a link is visible), and
copies only what differs.

## Verified

| Case | Result |
|---|---|
| clean profile | `in sync: mini (15 files)`, exit 0 |
| one corrupted file + 13 missing | lists all 14, exit 1 |
| after a sync | `in sync: live (15 files)`, exit 0 |

## Not covered

It does not restart the harness and does not know whether the process was started before the copy. The
rule stays: sync, then restart.
