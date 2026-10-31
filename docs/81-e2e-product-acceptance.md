# End-to-end product acceptance on the real mini profile

Previous rounds proved pieces: a route disappears, a module loads, a fixture test is green. This one ran the
**whole product path** against the live profile, with real clicks, and restored the profile byte-for-byte.

## The run

| Step | Result |
|---|---|
| patch before | `248ff6e3810389c4` |
| open the console, plugin list, click `dsh-quicktest` then Ctrl-click `turnstile-probe` | summary `已选 2 个 · 全部启用中` |
| designer → Common → 批量停用已选 | **2 queue entries** |
| Inspect → 生成并检查队列 → 生成 / 预览 | preview dialog opened |
| confirm | patch becomes `cc39258e16abe12f` |
| written rows | `- id: turnstile-probe / disabled: true` and `- id: quicktest / disabled: true` |
| restart the harness | no activation failures |
| `GET /turnstile/runtime` (probe's route) | **404** |
| `GET /turnstile/plugins` | 200 |
| batch **enable** through the same path | patch returns to `248ff6e3810389c4` |
| restart again | probe route **200**, `quicktest` all checks passed |

Byte-identical restore after a full UI round trip is the strongest evidence this project has produced:
selection, batch queue, hooks, preview, confirm, atomic write, restart, reverse write, restart - and the
file is exactly what it was.

## What this acceptance actually exercised

| Capability | Where it showed |
|---|---|
| multi-select (P0-2) | summary line with two ids |
| batch queue (P0-2) | two entries from one click |
| hook rules (P0-5) | the queue passed `no-duplicate` / `queue-limit` unchanged |
| preview + confirm (existing) | dialog, then a single atomic write |
| capabilities (P0-1) | both plugins have config rows, so the batch buttons stayed enabled |
| designer transaction | the write went through the plan/confirm path, not a direct file write |

## Friction found while driving it

The preview needs **two** steps (`生成并检查队列` then `生成 / 预览`), and the second button is disabled
until the first has computed a preview for the current queue. That is defensible (it prevents previewing a
stale queue) but it cost me two scripted attempts, and a first-time user will hit the same wall.

Recorded as a UI issue, not fixed: the honest options are (a) let `生成 / 预览` compute on demand, or
(b) show `先检查队列` on the disabled button. Picking one is a design decision, not a bug fix.

## Profile state afterwards

```
cordis.patch.yml  248ff6e3810389c4  (unchanged from before the run)
probe route       200
quicktest         all checks passed
```
## Addendum: the two-step friction is fixed

`生成 / 预览` now computes the preview itself when it is missing or stale, so the separate
`生成并检查队列` click is optional rather than required. Three changes, all small:

```js
// 1. the handler computes on demand
const generate = btn('生成 / 预览', async () => {
  if (ds.busy) return;
  if (!(ds.previewKey === currentKey() && ds.preview)) await ensurePreview();
  if (ds.preview && !ds.error) { ds.dialog = true; render(); }
}, 'designer-generate');

// 2. a stale preview no longer disables the button
generate.disabled = !ds.operations.length || ds.busy || Boolean(ds.error);

// 3. a matching key is not enough - a cancel can leave the key set with no preview
if (ds.busy || (ds.previewKey === key && ds.preview)) return;
```

**Bug 3 was real and only visible in a long session**: after a cancelled preview the key still matched,
`ensurePreview` returned early, and the button then did nothing. A fresh page never showed it, which is
why the first isolated repro passed and the suite failed.

One behaviour is deliberately unchanged: after a **refusal** (for example a duplicate command) the button
stays disabled until the queue changes. The refusal is the reason there is nothing new to preview, and
silently clearing it would hide the problem. The e2e documents this by reloading before it tests the
one-click path.

Designer e2e 42 -> **44/44** (one-click preview, plus proof that a reload restores the draft queue).
