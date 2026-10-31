# Multi-select: a selection is data (P0-3, first slice)

Shape taken from LowCodeEngine's `SettingTarget`: a multi-selection is a value with an anchor, reads
report mixed values instead of picking a winner, and a batch change is produced as a list of operations
rather than executed by the widget. MIT, shapes only.

## Module

`lib/selection.js`:

```js
select(state, id, { ctrl, shift, order })  // plain replaces, ctrl toggles, shift extends from anchor
commonValue(rows, key)                     // { value, mixed }
batchToggle(rows, disable)                 // { ops, skipped:[{name, reason}] }
describe(state, rows)                      // '已选 2 个 · 停用状态不一致'
```

`test/selection.test.mjs` - 7 checks: replace, ctrl add/remove, shift range both directions, shift
without anchor, mixed detection, row-less plugins skipped with a reason, summary wording.

## Wired

The plugin table now passes the click event through, so `state.picked` follows ctrl/shift:

```js
onclick: (e) => onClick(e)
(ev) => { pickPlugin(p, ev); select(selectionForPlugin(p)); }
```

and a summary line (`data-testid="selection-summary"`) states the joint status, updated in place so a
click does not need a full re-render.

Console e2e: 61 -> **62/62**, with

| Check | Result |
|---|---|
| ctrl-click builds a multi-selection | summary shows `已选 2 个` |

## What is NOT wired yet

`batchToggle` exists and is tested, but no button calls it: the designer queue still takes one plugin at
a time. That is the next slice - "apply to all selected" in the designer palette, which needs the
inspector to accept a selection rather than a single item.

## Regression

```
console e2e   62/62
panel e2e     29/29
designer e2e  30/30
selftest      67 passed / 6 skipped
package tests 13 groups (selection adds 7 checks)
```
