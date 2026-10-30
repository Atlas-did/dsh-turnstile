# Windows open-source sources: what was actually read

Rule for this file: only list a file after its bytes were fetched and looked at. No "I know this
project" entries.

## How the source was obtained

A full clone of the candidates is 100-550 MB, which is not reasonable to pull here just to read a few
mechanisms. Instead the files were fetched one by one from the pinned branch and the byte counts
recorded. Same information, none of the ballast.

| Project | License | Repo size | Read this time |
|---|---|---|---|
| **System Informer** (winsiderss/systeminformer) | MIT | ~103 MB | `SystemInformer/colmgr.c` (28.5 KB), `colsetmgr.c` (22.5 KB), `findobj.c` (63 KB) |
| DevToys (veler/DevToys) | MIT | ~224 MB | not yet |
| WinMerge (WinMerge/winmerge) | GPL-2.0 | ~546 MB | not yet - licence needs a decision before any code shape is copied |

## Mechanism 1: a column manager with a sort context (`colmgr.c`)

```c
typedef struct _PH_CM_SORT_CONTEXT
{
    PPH_PLUGIN_TREENEW_SORT_FUNCTION SortFunction;
    ULONG SubId;
    PVOID Context;
    PPH_CM_POST_SORT_FUNCTION PostSortFunction;
    PH_SORT_ORDER SortOrder;
} PH_CM_SORT_CONTEXT;
```

A sort is not a comparator passed at call time; it is a **context object** carrying which column
(SubId), the comparator, an optional post-sort hook and the direction. `PhCmSaveSettings(HWND)`
returns the column layout as a serialised string.

Maps to us: our console sorts by a string key in the browser and keeps nothing. The transferable
idea is the *context object*: `{column, direction, filter-epoch}` recorded with the row order, so a
refresh can reproduce the same order instead of falling back to name order.

## Mechanism 2: column sets as a compact settings string (`colsetmgr.c`)

```c
columnSetList = PhCreateList(10);
settingsString = PhaGetStringSetting(SettingName);
remaining = settingsString->sr;
if (!PhSplitStringRefAtChar(&remaining, L'-', &part, &remaining)) goto CleanupExit;
if (!PhStringToInteger64(&part, 10, &count)) goto CleanupExit;
```

Named column layouts live in the settings store as `count-id-id-id...`, parsed with a split and an
integer conversion, with a bail-out on anything malformed. No JSON, no schema version - the format
is self-delimiting and cheap to validate.

Maps to us: the console remembers a sort and a filter only for the page session. Persisting a small
`view-state` string in the profile's state directory would survive restarts with the same
fail-closed parse (bad value -> default layout, never a crash).

## Mechanism 3: search that does not block the window (`findobj.c`)

```c
#define WM_PH_SEARCH_SHOWDIALOG (WM_APP + 801)
#define WM_PH_SEARCH_FINISHED (WM_APP + 802)
static HANDLE PhFindObjectsThreadHandle = NULL;
static PH_EVENT PhFindObjectsInitializedEvent = PH_EVENT_INIT;
```

The search runs on its own thread fed by a work queue, and reports back through window messages
(show dialog / finished). The UI thread never enumerates.

Maps to us: today every filter is synchronous over at most a few hundred rows, which is fine. The
moment the deep-architecture view indexes source files (thousands of nodes), the same split is
needed: build the index off the request, answer from the index, send a "finished" event so the page
can say "still indexing" instead of silently returning partial results.

## What this does not establish

Reading three files is not having studied a 103 MB program. Property sheets, the tree control,
icon/colour semantics and its plugin API are still unread, and nothing here is implemented in our
console yet. The next files are listed in the goal: `propsheet.c`/`proctree.c` for the property
model, `treelist.c` (phlib) for virtualised rows.

## Why not copy code

System Informer is MIT, so copying is legal with attribution - but it is Win32 C against their own
framework (`phapp.h`, `PH_STRING`) and would not transplant into a browser console. The value here is
the *shape* of the mechanism, not the lines.
