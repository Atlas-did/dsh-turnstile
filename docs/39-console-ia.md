# Console: information architecture, and what the demo gets right

Reviewed `app/index.html` from the Kimi package (592 lines, vanilla JS, 6 render functions,
dark terminal theme). This records what we keep, what must change to fit real data, and the
order the screen answers questions in.

## The question order (this is the design)

A monitoring screen that opens with a wall of checks has already failed. The console answers,
in this order, and each answer is one glance:

1. **Can I keep working?** - one strip: `CLEAR` / `BLOCKED`, plus *what changed since the last
   run* (new findings, resolved findings, plugins added/removed). A user opens this after an
   install, so the delta is the actual answer, not the absolute state.
2. **If blocked, by what?** - blocking findings first, each with the file and the fix snippet.
3. **What is advisory?** - collapsed by default, one line each, expandable.
4. **Where is the crowding?** - UI surfaces and the override chain, because the next question
   after "is it broken" is "who is fighting whose layout".
5. **Has this been flapping?** - the timeline, with exit codes as the y-axis.

Checks are *not* the headline. They are the ledger that justifies the verdict, one click away.

## Reuse matrix

| Demo piece | Verdict | Note |
|---|---|---|
| theme tokens (`--signal`, `--pass`, `--fail`) | **keep** | good contrast, and `--fail` is not pure red |
| 5-panel grid, 2-column at wide, stacked at narrow | **keep** | matches the reading order above |
| ledger rows act as filters (`aria-pressed`) | **keep** | this is the best interaction in the demo |
| severity chips (all / blocking / advisory) | **keep**, add `resolved-since-last` |
| history bars with exit-code legend | **keep** | ours has real exit codes 0/1/3/6/7/9/11 |
| profile switch `desktop / mini` with pre-baked data | **drop** | replace with a real profile selector backed by the report route |
| `重跑闸门` button | **keep, wired** | in DSH it must call the host route; a static page cannot |
| `verdict` precomputed as a string | **change** | compute from `result` + `blocking[]` so it cannot disagree with the data |
| `checks[].ev` single letter | **change** | render `evidence` from the contract, and show `?` when unknown instead of guessing |

## Data the demo assumes that we do not have yet

| Demo field | Contract status |
|---|---|
| `stack[]` (override chain) | needs `overrides[]` - computed today only inside `gate-map.mjs` |
| `surfaces[].n` | exists, but the demo cannot say *which* plugins; contract adds `plugins[]` |
| `history[]` with `partial` | exit 3 maps to `partial`; the mapping must be explicit, not inferred |
| `findings[].blocking` | derivable from the owning check + its advisory flag |

Consequence: **the console cannot be built before the report v2 extraction** (docs/38). Building
the UI against demo data and wiring later would hide exactly the mismatches this table lists.

## What the demo got wrong, in the small

- `innerHTML` with template strings for every row. Ours must use `textContent` per cell, because
  finding text is arbitrary plugin content (a plugin name can contain HTML).
- The `ms` sum in the ledger adds serial durations while our checks run in **parallel**; the
  header must show wall clock, and the per-row ms stays as a diagnostic.
- No empty state. With 12 checks and 0 findings - our common case - the demo renders an empty
  box. Ours says `12 checks, no findings, 8.8s`.

## mock-click: the assertions, spelled out

Clicking is not the test. These are:

1. `page.mouse.click(x, y)` where `x,y` come from `boundingBox()` of the target - and the target
   must be scrolled into view first (`scrollIntoViewIfNeeded`), because that is what broke the
   earlier attempt;
2. after click 1: the property block contains the row id **string**, the state word, and at
   least one UI surface name - asserted separately, so a partial render fails;
3. after click 2 (toggle): `cordis.patch.yml` changed **and** `js-yaml.parse` still succeeds
   **and** the exact row id appears with `disabled: true`;
4. after click 3 (toggle back): the file is byte-identical to the pre-test copy;
5. every step asserts the panel is still mounted (the earlier failures were silent unmounts);
6. on any failure the script restores the patch from the backup before exiting non-zero.

Rule: no assertion may depend on wording that a translation could change. Assert on ids, file
content and counts; wording is checked only for the empty/present distinction.
