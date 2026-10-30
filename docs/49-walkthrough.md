# Walkthrough: install an experiment, move it, promote it

A reproducible run of the whole loop on a lab profile. Replace `<profile>` with your own lab
profile path (never a production one). Commands and outputs below are copied from a real run.

## 1. Install an experiment plugin

```bash
node tools/lab.mjs <profile> --install plugins/demo-anchor-widget --anchor top-left
```

```
bundle declares its own rows; wrote a config override only (anchor: top-left)
installed demo-anchor-widget into <profile>
```

Three things happened: the package was copied into `node_modules`, the bundle entry was appended,
and - because this bundle ships its own row - a **config override** was written instead of a second
row (two rows with the same id in one scope is a real clash, not a harmless duplicate).

Restart the harness, then open the harness URL and the widget appears in the top-left corner.

## 2. See it in the occupancy map

```bash
node tools/occupancy.mjs <profile>
```

```
! ui-slots   4   3   dsh-better-sidebar, dsh-genui, turnstile-popup, demo-anchor-widget
14 surfaces, 11 contested (! = 2+ plugins, at least one hardcoded)
```

The widget shows up in the same list as the rest of the UI, with the count of plugins that cannot
be repositioned from configuration.

## 3. Take a lab baseline

```bash
node tools/promote.mjs --from <profile> --to <main profile> --snapshot
```

```
baseline written: <profile>/turnstile-lab-baseline.json
```

Everything after this point is "what this experiment changed". Without a baseline the diff would
include every historical difference between the two profiles.

## 4. Change something in the lab

```bash
node tools/anchor.mjs <profile> --package demo-anchor-widget --anchor bottom-right --apply
```

```
written; restart DSH to take effect.
```

The same move can be done in the browser: open the panel, press 拖动, drag the plugin's row onto
the bottom-right zone. The panel writes the same file, through the same rules.

## 5. Read the change list

```bash
node tools/promote.mjs --from <profile> --to <main profile>
```

```
改动清单（1 项）:
  ~ 位置       demo-anchor-widget  top-left → bottom-right

DRY RUN — 确认后加 --apply（每步留 .bak，可回滚）。
```

This is the artefact an agent reads and explains. It is deliberately textual and small: one line
per change, no diffs of the whole file.

## 6. Apply, or decline

`--apply` only automates objective changes (adding/removing bundles). Preference-like changes
(anchor, enabled/disabled) stay manual - they are replayed through `anchor.mjs` / `manage.mjs`,
one at a time, so the user sees each one.

Every write leaves `<file>.bak-<timestamp>`. To undo, copy the newest backup back over the file.

## 7. Uninstall the experiment

```bash
node tools/lab.mjs <profile> --uninstall demo-anchor-widget
```

```
uninstalled demo-anchor-widget from <profile> (restart DSH)
```

It removes the package directory, the `dependencies` entry, the bundle entry and the patch row -
in that order, so nothing is left pointing at a deleted package.

## Verification used in this repository

| step | check |
|---|---|
| install/uninstall | `selftest`: bundle present after install, absent after uninstall |
| anchor | `selftest`: dry run shows the change and leaves the file byte-identical |
| promote | `selftest`: prints a JSON plan, dry run by default |
| panel | `tools/e2e-panel.mjs`: real input events, patch restored byte-identical |
| health after every step | `quicktest` on the lab profile, 10 checks |
