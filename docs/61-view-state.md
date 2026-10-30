# View state: remembering the table, with a fail-closed parser

First mechanism actually **taken from** a Windows source and shipped, not just noted.

## What was borrowed

System Informer stores its column layout as a small self-delimiting settings string and bails out on
anything malformed (`colsetmgr.c`, read in docs/58). We do the same for the console's view state:
a tiny JSON record, sanitised field by field, never trusted.

```js
// view-state.js
export function sanitizeViewState(input) {
  const out = { ...DEFAULT_VIEW_STATE };              // view, query, status, sortKey, sortDir
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  if (VIEWS.indexOf(input.view) !== -1) out.view = input.view;   // unknown -> default
  if (SORTS.indexOf(input.sortKey) !== -1) out.sortKey = input.sortKey;
  if (input.sortDir === 1 || input.sortDir === -1) out.sortDir = input.sortDir;
  if (typeof input.query === 'string' && input.query.length <= 120) out.query = input.query;
  return out;
}
```

Per-field fallback, not wholesale: a bad `view` does not wipe a valid `status`.

## Routes

`GET /turnstile/view-state` returns `{state, source}` where `source` is `default | file | fallback`,
so the UI can tell the user their layout was not found rather than pretending.
`POST` sanitises and writes atomically (temp + rename); a corrupt file on disk is never fatal.

## Behaviour in the console

- boot: `restoreView()` then `load()` - the page comes back on the page, filter and sort you left;
- changes: view switch, search input and column sort each schedule one debounced write (400 ms);
- a corrupt file: page loads on defaults, `source: "fallback"`.

## Tests

| Suite | Adds |
|---|---|
| `plugins/turnstile-popup/test/view-state.test.mjs` (7 checks) | default / corrupt / array / unknown-key / per-field fallback / atomic round trip / over-long query |
| `tools/e2e-console-offline.mjs` (+2 checks) | corrupt file still renders; clicking a nav item persists `view: plugins` |

Console e2e went 55 -> **57/57**. The other suites are unchanged: panel 29/29, designer 29/29,
self-test 67 passed / 6 skipped, package tests 8 + 5 + 7.

## A real trap found by this work

The e2e fixture directory was polluted with a live `turnstile-view.json` (a manual POST during
development wrote into `tests/console-fixture/.turnstile`). Every later run then restored `view:
plugins` and the overview assertions failed at `metric-architecture`. The fix was to delete the file
and keep fixture state out of the repository: a test fixture must not remember what a developer did
to it interactively.
