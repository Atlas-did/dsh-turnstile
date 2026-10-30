# Modules, and the long-term goal of each

One panel that does everything became a 330px card with five sections stacked inside it. That was
the wrong shape: a dashboard is a page with navigation, not a drawer. This file splits the work
into modules that can each be finished, verified and reviewed on its own.

## The shape we are building (A: a settings surface)

    Settings -> (sidebar) 插件体检 / Turnstile
      ├─ 概览      verdict, counts, what changed since last run
      ├─ 架构图    full-size, generated, zoomable
      ├─ 占用      who occupies which surface, and can it move
      ├─ 插件      list + properties + enable/disable + position
      └─ 控制台    panel requests and filtered host log

Registered through `ctx.slots.inject("settings.section", ...)` - the same hook `dsh-better-sidebar`
uses for its 侧边卡片 page, so it inherits the native settings shell (nav entry, section chrome,
theme) instead of floating over the conversation.

## Modules

| # | Module | Its own long-term goal | Done when |
|---|---|---|---|
| M1 | Settings surface | Become the single place a user opens to answer "is my plugin set healthy, and what is fighting what" | appears under Settings, five sub-pages, every number read from a real report |
| M2 | Architecture graph | Turn the profile into a diagram a person can read without reading a log | generated from live data, opens full size, nodes clickable, passes the generator's own layout checks |
| M3 | Occupancy and position | Make "who owns this corner" answerable, and make moving a plugin a two-click operation | contested surfaces listed with counts, hardcoded ones marked, position writes go through backup + dry run |
| M4 | Console | Make an experiment plugin's behaviour visible without opening a log file | request counters + filtered tail, empty state explains why |
| M5 | Experiment + promote | Let a user try anything in the lab and carry only the verified part to the main profile | install/uninstall round trip, baseline diff, one-line-per-change list |
| M6 | Distribution | A stranger can install and run it from the README alone | INSTALL works on a clean machine, skill and preset both reachable, CI green |

## Reference projects (what each contributes)

| Reference | What it teaches | What we take |
|---|---|---|
| **wxFormBuilder** (visual GUI designer that emits code) | A designer is canvas + property inspector + codegen, and the **codegen is the product** | property inspector discipline: every control has a name, a value and an output target; edits are previewed before they are written |
| **Tkinter visual designers** | Drag/drop without generated code is a toy | the drag exists to produce a config, not to look nice - our equivalent output is a `cordis.patch.yml` row |
| **browser devtools** | elements / console / network / memory are four panes, not one list | four sub-pages, each answering one question (M1) |
| **archify** | a diagram is authored as data, then validated | our graph is generated from occupancy JSON, never hand-drawn (M2) |

Note on research: a general web search for these references returned mostly SEO pages and
tutorials, so the table above rests on the two projects the user named plus well-known devtools
structure - not on a surveyed market. Say so rather than dress it up.

## Order and gates

1. M1 first (it is the container; the others plug into it as pages).
2. M2 and M3 next (they are the two questions users actually ask).
3. M4 is small and independent.
4. M5 already exists as CLI; the module goal is to surface it in M1 rather than to rebuild it.
5. M6 last, once the pages stop moving.

Each module lands with a fixture and a screenshot reviewed by a human before the next one starts.
No module is "done" because its code exists - it is done when the page can be opened and read.
