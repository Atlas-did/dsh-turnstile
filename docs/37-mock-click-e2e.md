# mock-click: an E2E harness that clicks the panel for real (design)

Why this exists: the panel's toggle flow was verified by dispatching `element.click()` from
`page.evaluate`. That proves the handler runs, not that a human can hit it. This plugin closes
that gap by driving the UI with real `page.mouse` events and asserting on the profile file.

## Shape

A host-only plugin installed into **mini**, plus one script:

    plugins/mock-click/            host half: exposes POST /mock-click/run
    tools/e2e-panel.mjs            playwright driver: real clicks, reads the patch file

The host half is deliberately tiny: it reads `state/report-<profile>.json` and returns the
click plan (which row to click, expected state after). It does not click anything - it only
provides the data a human would use.

## The flow it must prove

1. panel opens (card visible, `mini · 插件 N` header present);
2. real click on a row with `page.mouse` -> property panel shows row id, state, UI surfaces;
3. real click on the toggle button -> `cordis.patch.yml` gains `- id: <row>` + `disabled: true`;
4. restart-free re-read: report regenerated, the row shows as disabled;
5. real click again -> the block is removed, YAML still parses;
6. assert the patch is byte-identical to the pre-test copy (we restore what we touched).

## Rules that make it trustworthy

- **Never leave a mutation behind.** Copy `cordis.patch.yml` first, restore it in a `finally`.
- **No JS dispatch.** `element.click()` is exactly what we are trying to stop relying on; the
  driver must use `page.mouse.click(x, y)` computed from `boundingBox()`.
- **Fail loudly on absence**: a missing panel is a failure, not a skip. If the plugin is not
  installed the run is an environment case, and the exit code follows the existing contract
  (3 = coverage incomplete), never 0.
- **Scrolling is part of the test**: the row must be scrolled into view by the driver, because
  that is the reason the earlier headless click timed out.

## Where it runs

mini only. The desktop profile is the user's working environment; an E2E script that toggles
plugins has no business there. The script refuses to run when `DSH_PROFILE` does not match
`mini`.

## Acceptance

    node tools/e2e-panel.mjs --profile mini --port 18770
    -> steps 1..6 printed with PASS, patch restored, exit 0
    -> CI (no browser): environment case, exit 3, never a silent green
