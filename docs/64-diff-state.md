# Diff view: orthogonal bitfields (from WinMerge)

Fourth mechanism read from a Windows project. Licence note first, because it matters:

> WinMerge is **GPL-2.0**. Only the *shape* of its design was taken. No code was copied, and none of
> its identifiers, strings or algorithms were transcribed. If this ever needs to be more than a shape,
> the licence question has to be settled first.

## What was read

| File | Size | What it establishes |
|---|---|---|
| `Src/DiffContext.h` | 8.2 KB | the compare context owns paths, options, filters and the result list; sentinels `DIFFS_UNKNOWN = -1`, `DIFFS_UNKNOWN_QUICKCOMPARE = -9` |
| `Src/DiffItem.h` | 13.9 KB | `struct DIFFCODE` - one `unsigned long` holding every dimension of a comparison result |

The code itself:

```c
// We use extra bits so that no valid values are 0
// and each set of flags is in a different hex digit
TEXTFLAGS=0x3FU, TEXT=0x1U, BIN=0x2U, ...
TYPEFLAGS=0xC0U, FILE=0x40U, DIR=0x80U,
COMPAREFLAGS=0x7000U, NOCMP=0x0000U, DIFF=0x1000U, SAME=0x2000U, CMPERR=0x3000U,
...
static bool Check(unsigned code, unsigned mask, unsigned result) { return ((code & mask) == result); }
```

Three transferable rules:

1. **one dimension per mask**, so `(code & mask) === value` cannot compare mismatched dimensions;
2. **no valid value is zero**, so an empty code means "never compared", not "same";
3. **explicit unknown** (`DIFFS_UNKNOWN_QUICKCOMPARE`) instead of pretending a fast comparison was a
   careful one.

## What was shipped

`lib/diff-state.js` with four dimensions - change, subject, side, confidence - and the same check
idiom:

```js
export const CHANGE = { MASK: 0x3c, NONE: 0x04, ADDED: 0x08, REMOVED: 0x0c, MODIFIED: 0x10 };
export function is(code, dimension, value) { return (code & dimension.MASK) === value; }
export function isKnown(code) { return (code & ~knownMask) === 0; }
export function describe(code) { /* 修改 · 值 · (快速比对，未逐行确认) */ }
```

`test/diff-state.test.mjs` - 8 checks:

| Check | Why |
|---|---|
| masks never overlap | a new dimension cannot silently steal bits |
| every value is non-zero and inside its mask | the "0 is unset" invariant |
| composed code answers each dimension independently | the point of the packing |
| unset change reads as **no change**, not a guess | the failure mode this prevents |
| foreign bits -> `无法识别的差异码` | fail-closed, like the other modules |
| describe names change, subject, side | one string for the UI |
| quick compare says `未逐行确认` | honest about confidence |
| zero means `未比较` | distinct from "same" |

## What is NOT done

The designer's diff view still renders plain text lines; it does not emit these codes yet. The module
exists and is tested, but it has no caller in the page. Status: **mechanism understood and encoded,
page integration pending** - the same honest split as docs/63.

## Regression after this round

```
console e2e   60/60   (properties page now model-driven, +1 check)
panel e2e     29/29
designer e2e  29/29
selftest      67 passed / 6 skipped
package tests 8 + 5 + 7 + 7 + 7 + 8
```
