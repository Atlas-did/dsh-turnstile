# History timeline as a parallel panel (P0-1, done the safe way)

A previous attempt replaced `ds.past` / `ds.future` with the timeline. The designer suite fell from
30/30 to 13/15 because the redo button still read the old state, and it was reverted (docs/70).

This round did the other thing: **the timeline runs beside undo/redo and never replaces it.**

## Implementation

```js
function mutate(fn, label) {
  ds.past.push(copy(ds.operations));    // unchanged
  ds.future = []; fn();                 // unchanged
  ds.timeline = (ds.timeline || []).concat([{ time: Date.now(), label, snapshot: copy(ds.operations) }]).slice(-100);
}
```

and a panel (`data-testid="designer-timeline"`) listing `HH:MM:SS · 标签 · N 条`, newest first, each row
clickable (`history-<index>`). Jumping:

```js
ds.future.push(copy(ds.operations));
ds.operations = copy(t.snapshot);
ds.timeline = ds.timeline.slice(0, index + 1);   // the future beyond the jump is dropped, like redo
```

## What this buys

* time and a label on every step (undo/redo cannot express either);
* jump to any earlier state in one click instead of N undos;
* undo/redo untouched, so the existing keyboard shortcuts and buttons keep working.

## Verification (designer e2e 31 -> 34/34)

| Check | Evidence |
|---|---|
| history panel lists the applied edits | >= 2 rows after two edits |
| jumping to an earlier entry shortens the queue | 2 -> 1 entries |
| undo remains enabled after a jump | button not disabled |

## Honest gaps

* The module `lib/history-timeline.js` (29 checks) is still not the code the panel uses - the panel
  records plain objects. The module's extra rules (transient states, no-op suppression) are therefore
  **not** enforced in the UI yet. Either the panel adopts the module next round, or the module is
  removed as speculative. Leaving both would be exactly the duplication this project keeps warning about.
* Labels are coarse (`修改队列`); per-operation labels would need each palette action to name itself.
