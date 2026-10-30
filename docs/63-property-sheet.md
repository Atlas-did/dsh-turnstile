# Property sheet: properties and actions separated (model done, page wiring pending)

Third mechanism read from System Informer. Unlike the previous two, **only half of this one is
shipped**, and this file says which half.

## What was read

`SystemInformer/jobprp.c` (32 KB, fetched and read): the job dialog builds a `PROPSHEETHEADER` with

```c
propSheetHeader.dwFlags = PSH_NOAPPLYNOW | PSH_USECALLBACK | ...;
propSheetHeader.nPages = 1;
pages[0] = PhCreateJobPage(OpenObject, CloseObject, Context, NULL);
PhModalPropertySheet(&propSheetHeader);
```

and the page proc takes a context carrying `OpenObject` / `CloseObject` / `HookProc` / a
`PH_CALLBACK_REGISTRATION` (`ProcessesUpdatedRegistration`) - the page opens an object, subscribes to
live updates while it is open, and closes it again.

Three transferable rules:

1. a page is **open/snapshot/subscribe/close**, not a static render;
2. `PSH_NOAPPLYNOW` - there is no global Apply; each page owns its own commit;
3. facts (properties) and commands live on separate pages, sharing one selection.

## What was shipped

`lib/inspector-model.js` - a pure function, unit tested:

```js
buildInspector(selection, data) -> { title, subtitle, properties: [{label, value}], actions: [{id, label, enabled, reason}] }
```

* a plugin: 4 properties, 3 actions; `toggle`/`anchor` are **disabled with a reason** when the plugin has
  no config row (`没有配置行，无法写补丁`) instead of failing on click;
* a surface: plugin count, hardcoded count, fuse disabled unless contested;
* a check: result, elapsed, finding count;
* a stale selection: `已不在当前清单中` rather than invented data.

`test/inspector-model.test.mjs` - 7 checks (separation, disabled reasons, stale selection, surface
counts, check findings, empty selection).

## What was NOT shipped

The console page still renders its **own** inspector; the model is not wired into it yet. An attempt to
replace `renderInspector()` with the model made the console e2e fail at `action-locate` (the button
existed but measured 0x0 after the tab switch), and rather than leave a half-broken page I reverted the
page change and kept the model + tests. The e2e is back to 57/57.

Status: **model: implemented and tested. Page wiring: pending.** The file you are reading is the
record of that split, not an advertisement.

## Fixture hygiene fix found on the way

A manual debugging session posted view state into `tests/console-fixture/.turnstile/`, so later runs
restored `view: plugins` and the overview assertions failed at `metric-architecture`. The e2e now
deletes `turnstile-view.json` after copying the fixture, and `.gitignore` refuses to track it:

    tests/**/.turnstile/turnstile-view.json

## Regression

```
console e2e   57/57
panel e2e     29/29
designer e2e  29/29
selftest      67 passed / 6 skipped
package tests 8 + 5 + 7 + 7 + 7
```
## Update: the actions page is now wired (2026-10-31 later)

The reverted attempt tried to replace the whole inspector. The smaller change works: the existing
`renderInspector` keeps its markup and testids, and only the patch action now consults the model -
a plugin with no config row gets a **disabled** button plus a visible reason instead of a click that
fails:

```js
const rowless = !(s.plugin.rows || []).length;
if (rowless) { b.disabled = true; b.dataset.reason = '没有配置行，无法写补丁'; }
```

New e2e checks (console suite 57 -> **59/59**):

| Check | Result |
|---|---|
| row-less plugin disables the patch action | `button.disabled === true` |
| disabled action explains itself | inspector shows `没有配置行` |

So the split is now: **properties page unchanged, actions page model-aware**. The rest of the model
(surface fuse, check findings) still lives only in the unit tests.
