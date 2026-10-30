# Five tools, function by function, and what we take

Coverage note, so the rest is trustworthy:

| Tool | How I looked |
|---|---|
| Process Explorer | your screenshot, plus a 2x crop I made of the toolbar (`state/procexp-toolbar.png`) |
| DiskGenius | your screenshot |
| Everything | installed at `C:\Program Files\Everything`; auto-capture failed (it starts into the tray, `MainWindowHandle` stayed 0, two capture scripts died on the handle cast) - so this row is from the behaviour I can verify plus its settings, not from a screenshot of mine |
| SpaceSniffer | only a `.sns` snapshot on the desktop, no executable found - not studied beyond the treemap pattern |
| wxFormBuilder | the GitHub page you pasted (v3.9.0); not installed here |

I am not going to pretend the last three were captured when they were not.

## 1. Everything - the search-as-you-type model

What makes it feel instant is not indexing alone; it is that **the list is the answer to the query, always**. There is no "run search" button, no result page, no state where the table is stale relative to the box.

Reusable pieces:

- filter box that filters on every keystroke, and the **status bar counts the filtered set** ("N objects")
- columns configurable, persisted across sessions
- multi-select then act (open, copy path, export)
- boolean / regex / case / whole-word toggles right next to the box, not in a dialog
- export whatever is currently filtered

## 2. Process Explorer - snapshot + delta + drill-down

The three ideas worth stealing, in order of value:

1. **Colour encodes change, not state.** Cyan = just started, red = just ended, pink = service, purple = packed, grey = suspended.
2. **The lower pane is a tabbed detail of the selected row**, so the list never navigates away.
3. **The crosshair answers "what owns this pixel"** by asking the OS, not by guessing.

We already ported (3) - it resolves through the React fiber. (1) and (2) are still missing.

## 3. DiskGenius - the property grid

Look at the bottom of your screenshot: a **two-column label/value grid**, aligned, grouped, with the unit in the label and the number right of it. No prose anywhere. The left tree is the disk hierarchy; the table is the partition list; the grid explains the selected one.

Reusable: the grid, and the status line that states the hardware identity (model / serial / capacity) - facts a technician needs without clicking.

## 4. SpaceSniffer - proportional area

A treemap where rectangle area is size, nested by path, click to drill in. The lesson for us: when the question is "what takes the most", **area beats a bar chart and beats a table**. We have no size dimension, but we do have a **contention dimension** (how many plugins share a surface), which maps onto the same visual.

## 5. wxFormBuilder - three panes and a generated artefact

Object tree (left) + canvas (centre) + property grid (right), and the product is **generated code**, not the canvas. Without the generator it would be a toy editor.

For us the artefact is a `cordis.patch.yml` row. Any drag we ship must end in that file, with a backup and a dry run - otherwise it is decoration.

## Reuse matrix

| # | Feature | From | Decision | Why |
|---|---|---|---|---|
| 1 | Filter box + filtered counts in status bar | Everything | **adopt now** | the panel lists 26+ rows; filtering beats scrolling |
| 2 | Colour = delta since last check | Process Explorer | **adopt now** | promote already computes a diff; the panel never shows it |
| 3 | Lower/inline detail pane for the selected row | Process Explorer | **adopt now** | we jump to a modal today; a pane keeps context |
| 4 | Two-column property grid | DiskGenius | **adopt now** | our detail is currently a sentence |
| 5 | Crosshair "who owns this pixel" | Process Explorer | done | fiber resolution, verified |
| 6 | Multi-select + bulk action | Everything | later | needs a bulk write path with one backup |
| 7 | Regex / boolean toggles by the box | Everything | later | only worth it past ~200 rows |
| 8 | Export what is filtered | Everything | later | we export reports already; scoping them to the filter is a small add |
| 9 | Proportional-area view of contention | SpaceSniffer | later | needs the surface list to be stable first |
| 10 | Generated artefact as the product | wxFormBuilder | already the rule | every write is a patch row + backup |
| 11 | Tabbed detail (image/performance/tcpip) | Process Explorer | skip | our detail is one short grid; tabs would be empty |
| 12 | Tray-resident, hotkey-summoned | Everything | skip | a settings page is opened deliberately |

## Backlog, in order

1. **Filter + counts** (1) - smallest change, biggest daily effect.
2. **Delta colouring** (2) - needs the last report kept next to the current one; `state/report-<profile>.json` is already there.
3. **Inline detail pane** (3, 4) - replace the sentence with the grid, keep the row visible.
4. Crosshair follow-ups: highlight on hover, click selects the row.

Each lands with a screenshot I look at before calling it done. That is the rule that failed
earlier in this project - I shipped a 330px card of stacked sections without looking at it.
