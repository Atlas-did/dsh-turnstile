# Open-source references we actually picked

Selection rule: MIT/Apache first, small enough to vendor or wrap, and each must replace a piece
we are currently hand-rolling badly.

| Project | License | What it is | What we take from it | Verdict |
|---|---|---|---|---|
| **aidenybai/bippy** ★1.4k | MIT | "hack into react internals" - a maintained layer over the React fiber | our crosshair reads `__reactFiber$` by hand with a `for` loop; bippy is the supported version of that | **adopt** for M3 |
| **rjsf-team/react-jsonschema-form** ★15.9k | Apache-2.0 | forms generated from a JSON Schema | the property inspector: our row config is already schema-shaped, so the inspector can be generated instead of hand-written per field | **adopt** for M1 |
| **puckeditor/puck** ★13.5k | MIT | visual editor for React: canvas + inspector + state, MIT | the exact three-pane model and how it keeps the inspector in sync without a modal; also how it treats the produced config as the artefact | **study** (too heavy to vendor) |
| **xyflow/xyflow** ★38.8k | MIT | node graph UI (React Flow) | a live, pannable/zoomable topology where nodes are plugins and edges are occupancy - instead of a static SVG we regenerate | **later** (M2 when the graph must be interactive) |
| **zthxxx/react-dev-inspector** ★1.3k | MIT | click a component, jump to its source in the IDE | the "click -> source" jump we want from the crosshair (`vscode://file/...` is already how gate-map links work) | **study** |
| **GrapesJS/grapesjs** ★26.4k | BSD-3 (repo says NOASSERTION) | full web page builder | nothing directly; too coupled to HTML pages | **skip** |

## What each replaces

| Our hand-rolled thing | Replaced by | Effort |
|---|---|---|
| fiber walk with magic prefixes | bippy | small |
| 300 lines of inspector markup | rjsf + a schema per row type | medium |
| regenerated static SVG | xyflow (if it must be interactive) | larger, later |

## Licensing note

All five shortlisted projects are MIT or Apache-2.0, so vendoring or wrapping is fine with the
attribution we already keep in `LICENSE`. GrapesJS's metadata reports `NOASSERTION`, so it is out
regardless of what its site says - not worth the legal ambiguity for something we do not need.

## How we install them (not a dependency yet)

Nothing is added to `package.json` in this step. bippy and rjsf get added when the module that uses
them lands, so the repository never carries a dependency it does not exercise - the same rule we use
for fixtures.
