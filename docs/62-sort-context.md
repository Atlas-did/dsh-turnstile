# Sort context: reproducible order, not a remembered column

Second mechanism taken from System Informer and shipped.

## What was borrowed

`colmgr.c` treats sorting as a **context object**:

```c
typedef struct _PH_CM_SORT_CONTEXT {
    PPH_PLUGIN_TREENEW_SORT_FUNCTION SortFunction;
    ULONG SubId; PVOID Context; PPH_CM_POST_SORT_FUNCTION PostSortFunction; PH_SORT_ORDER SortOrder;
} PH_CM_SORT_CONTEXT;
```

The point is not the struct; it is that `(column, direction, tie-break)` is data, so the same
context always produces the same order. Our console previously had an inline comparator with no
tie-break, so rows with equal keys kept whatever order arrived.

## What we shipped

`lib/sort-context.js`:

```js
export function compareRows(a, b, ctx) {
  const key = SORT_KEYS.includes(ctx && ctx.key) ? ctx.key : 'name';
  const dir = ctx && ctx.dir === -1 ? -1 : 1;
  let c = compareValues(valueOf(a, key), valueOf(b, key));
  if (c === 0 && key !== 'name') c = String(a.name).localeCompare(String(b.name));   // tie-break
  if (c === 0) c = String(a.name).localeCompare(String(b.name));
  return c * dir;
}
```

The console now calls `TurnstileSort.orderedRows(filtered, state.sort)`, and `state.sort` is the
same object persisted by the view state from the previous round.

## The serving detail that bit once

The module is ESM (`export`), but the page loads it with a plain `<script>` - the browser rejected it
(`Unexpected token 'export'`) and the console table stopped sorting. The route now strips
`export function|const|class` and appends `window.TurnstileSort = {...}` before serving, so one file
serves both the node tests and the page. Two copies of the comparator would have drifted.

## Tests

`plugins/turnstile-popup/test/sort-context.test.mjs` - 7 checks:

| Check | Why |
|---|---|
| ascending / descending by name | basic direction |
| ties fall back to name in **both** directions | the bug this exists for |
| reversed input gives identical output | order-independence |
| unknown key falls back to name | fail-closed like the view state |
| missing fields do not throw | sparse rows come from real profiles |
| every advertised key is sortable | a new key cannot be added without its comparator |

## Regression after both mechanisms

```
console e2e   57/57
panel e2e     29/29
designer e2e  29/29
selftest      67 passed / 6 skipped
package tests 8 + 5 + 7 + 7
```
