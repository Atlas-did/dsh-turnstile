# UI-level runtime acceptance: a disabled plugin actually disappears

docs/67 proved a *route* disappears. A user asking "did it turn off?" means something visible, so this
round used a plugin that paints into the page.

## The signal

`dsh-meme` injects resources tagged `[data-plugin="dsh-meme"]`. When the harness skips the plugin, the
tag stops existing - countable, and impossible to fake with a file edit.

## The run (real mini profile)

| Step | `[data-plugin="dsh-meme"]` | patch sha256 |
|---|---|---|
| baseline | **5** | `248ff6e3810389c4` |
| disable (plan + confirm) | — | `8bf42d6d4f93b649` |
| **restart** | **0** | — |
| enable (plan + confirm) | — | `248ff6e3810389c4` (byte-identical) |
| **restart** | **5** | — |

`quicktest mini 18770 mini` afterwards: all checks passed.

Screenshots: `state/runtime-meme-on.png`, `state/runtime-meme-off.png`.

## Two bugs this exposed

**1. A synthesized row leaked (already fixed in round 13, confirmed here).** `dsh-meme` has no row in
`cordis.patch.yml` either - its row id is `dsh-expression`, declared by the package. Disabling created
`- id: dsh-expression\n  disabled: true`; the old enable code left `- id: dsh-expression` behind. With
`lib/toggle-text.js` the round trip is byte-identical, as the hash column shows.

**2. The live copy was stale.** The first attempt with the "fixed" code still leaked the row, because
the profile loads `research/turnstile-popup/` (a link), and that directory had not been re-synced after
the edit. The repository was correct; the running plugin was not.

This is the same class of mistake as the missing `<script>` tag in round 8: **the repo is not the
running system**. The working rule now: after editing a plugin, copy `lib/*` into the live directory
before restarting, or the test measures the old build.

## What is now proven, and what is still not

Proven: disable -> restart -> the plugin's injected resources are gone (5 -> 0); enable -> restart -> they
are back (0 -> 5); the patch file returns byte-identically; the harness reports no activation failures;
the profile health check passes.

Not proven: that every plugin behaves this way. `dsh-meme` injects DOM-visible resources; a plugin with
no visible surface has no such marker, and would need a different signal (a route, a tool, a log line).

## Regression

```
console e2e   60/60
panel e2e     29/29
designer e2e  30/30
selftest      67 passed / 6 skipped
package tests 9 groups / 63 checks
```
