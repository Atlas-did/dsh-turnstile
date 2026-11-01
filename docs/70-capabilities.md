# Capabilities: the model decides, the UI only asks

P0-2 from MECHANISM-PLAN, now landed on the real baseline (`oss/dsh-turnstile`, HEAD was `e966b0d`).

Shape taken from Designable's node rules - `canDrag` / `canDrop` / `canDelete` / `canClone` /
`canResize` - which ask a model instead of letting the canvas decide. MIT, shapes only, no code copied.

## The module

`lib/capabilities.js` (46 lines):

```js
pluginCapabilities(plugin)  -> { capabilities: { toggle, anchor, locate }, allowed }
surfaceCapabilities(surface) -> { capabilities: { fuse }, allowed }
checkCapabilities()          -> { capabilities: { export }, allowed }
```

Every refusal carries the fact that caused it:

| Situation | Capability | Reason |
|---|---|---|
| plugin has no `cordis.patch.yml` row | toggle, anchor denied | 该插件没有 profile 行，cordis.patch.yml 里无处可写 |
| plugin position is hardcoded | anchor denied | 该位置由插件硬编码，改不了 |
| surface used by one plugin | fuse denied | 只有一个插件占用这个面，没有可融合的对象 |

`test/capabilities.test.mjs` - 20 checks (declared ids, allowed/denied invariants, reason mandatory,
null input, hardcoded anchor, single-plugin surface).

## It is wired, not just tested

`lib/inspector-model.js` now reads capabilities instead of inlining the rule:

```js
const capsOf = () => (typeof window !== 'undefined' ? window.TurnstileCapabilities : globalThis.__caps);
const caps = capsOf().pluginCapabilities(p).capabilities;
{ id: 'toggle', ... enabled: caps.toggle.allowed, reason: caps.toggle.reason }
```

`console.html` loads `/turnstile/capabilities.js` **before** `inspector-model.js` and the actions pane
renders the model's `enabled` / `reason`. Evidence (console e2e, 60 -> **61/61**):

| Check | Result |
|---|---|
| disabled action explains itself | shows `该插件没有 profile 行` |
| capabilities module is loaded in the page | `typeof window.TurnstileCapabilities === 'object'` |

The second check is the one that matters: without it the first could pass on a fallback string.
## History timeline: a parallel panel, wired in both designers

`lib/history-timeline.js` (107 lines) landed with `test/history-timeline.test.mjs` - **29 checks**:

| Rule | Check |
|---|---|
| every step carries `{ time, kind, label, snapshot }` | 结构 |
| jumping to any step, not just adjacent undo | 跳转 |
| transient states (hover, focus, drag) never enter history | 临时状态 |
| a no-op action leaves no trace | 幂等 |

The **console command designer** and the **page builder** now both use a parallel history panel beside
the existing undo/redo. The panel adds time, a human-readable label and click-to-jump; it does not
replace the command stack. In the page builder, jumping also rebuilds `past` / `future`, so a later
undo, redo or branch edit continues from the state shown on the canvas.

A previous attempt replaced `ds.past` / `ds.future` outright and took the designer suite from 30/30 to
13/15, because the redo button still read the old state. That regression is why the two designers keep
the parallel-stack shape.

Current browser evidence in the isolated copy:

```
designer e2e  48/48
builder e2e   61/61
```

See `docs/150-builder-history.md` for the page-builder state contract and branch tests. The builder now also mirrors selection into a collapsible outline and supports scoped keyboard editing; see `docs/152-builder-outline-keyboard.md`.

## Where this came from, and the mistake worth remembering

The code was first written in an isolated copy (`~/.dsh/im/work2`) against an **older** baseline. The
live repository had moved on (it already had `inspector-model.js`, `virtual-window.js`, `diff-state.js`,
`toggle-text.js`, `sync-live.mjs`). Merging by file copy would have silently reverted that work.

What was merged instead: four files that genuinely did not exist on the live tree
(`capabilities.js`, `history-timeline.js`, and three test files), plus a deliberate edit to
`inspector-model.js` replacing its inlined rule with the capability model - and then the two old
assertions were updated rather than worked around.

## Related current wiring

- Page-builder multi-select and atomic batch editing: `docs/151-builder-multi-select.md`.
- Schema-driven inspector: `docs/74-field-schema.md`.
