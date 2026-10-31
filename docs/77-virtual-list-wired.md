# Virtual list: wired, with a 200-node fixture

`docs/65` shipped `lib/virtual-window.js` and deliberately left it unwired ("a branch no fixture exercises").
That was a debt: a tested module with no consumer. This round paid it off by building the fixture.

## Threshold, not always

```js
function archChildren(list) {
  if (window.TurnstileWindow && list.length > 120) return archVirtual(list);
  return node('div', { class: 'arch-children' }, list.map(archRow));
}
```

Below 120 children the existing grid stays (it looks better). Above it, the view switches to a
fixed-height scroller that builds one window of rows plus two spacers, so the scrollbar still
represents the whole list.

## The fixture

`tools/e2e-virtual-list.mjs` generates a profile with **200 real plugin packages** (each with a
`package.json` and a `cordis.patch.yml`), starts the console server against it, and checks:

| Check | Result |
|---|---|
| the profile node reports its 200 children | toolbar says `200 个直接子节点` |
| a huge child list switches to the virtual list | `arch-virtual` exists, `data-rendered` set |
| only a window of rows is built | rendered < 60 |
| scrolling swaps the rendered window | first label changes after scrolling to the end |
| no uncaught page errors | 0 |

## Two things this found

1. **`window.TurnstileWindow` was never served.** The module existed, was unit tested, and the page
   never loaded it - the same missing-route class of bug as `field-schema`/`hooks` in docs/76. Fixed by
   adding it to the host's `MODULES` list, the console server's whitelist and the console page's script
   tags.
2. **My first assertion was wrong**: it counted `[data-arch-id]` nodes and expected >= 40. A virtualized
   list renders ~13 rows, which is the point. The check now asserts the *model* count from the toolbar
   and separately that the DOM stays small.

## Not done

The virtual list is only used by the architecture view. The plugin table (which can also grow) still
builds every row; wiring it there needs row-height work for the table layout.
