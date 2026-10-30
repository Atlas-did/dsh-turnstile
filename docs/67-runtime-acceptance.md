# Runtime acceptance on the real mini profile

The earlier acceptance (docs/60) stopped at the file: the patch changed, but nobody watched the harness
**act** on the change. This round did that, with a runtime signal that cannot be faked.

## The signal

`plugins/turnstile-probe` registers `GET /turnstile/runtime`. If the harness skips the plugin, the
route stops existing - so `200 -> 404` is evidence the harness really skipped it, not that a file said
so.

## The run

| Step | Result |
|---|---|
| `GET /turnstile/runtime` before | **200** |
| patch sha256 before | `248ff6e3810389c4` |
| plan + confirm to disable `turnstile-probe` | `applied: true` |
| patch sha256 after disable | `5f1ac625e7efd070` |
| restart the harness | ok, no activation failures |
| `GET /turnstile/runtime` after restart | **404** |
| `GET /turnstile/plugins` after restart | 200 (other plugins unaffected) |

So: the plugin was genuinely not mounted. This is the runtime-level acceptance the goal asked for,
on top of the file-level one.

## A real bug the acceptance exposed

Re-enabling produced `4d7072f8b954ba31` instead of the original `248ff6e3810389c4`. The diff showed a
single leftover line:

```
- id: turnstile-probe
```

The probe had never had a row in `cordis.patch.yml` (it is a bundle; its row lives in the package's own
patch). Disabling **synthesized** a row; enabling removed only `disabled: true` and left the empty
skeleton behind. Every subsequent apply would then see a changed baseline.

Fix: the rules moved into `lib/toggle-text.js` - enable drops the whole block when nothing but
`- id: <row>` remains. `index.js` now delegates to it.

`test/toggle-text.test.mjs` - 6 checks:

| Check | Why |
|---|---|
| disable keeps every other key | the older bug |
| enable restores the original text | byte-level round trip |
| **a synthesized row disappears** | the bug this round found |
| disabling twice is idempotent | repeated confirm clicks |
| enabling a row that never existed changes nothing | defensive |
| `[]` sentinel is replaced by the first row | the empty profile case |

## State of the profile

`cordis.patch.yml` was restored to `248ff6e3810389c4` byte-for-byte from the pre-test backup, and the
harness is running with the probe enabled again.

## Regression

```
console e2e   60/60
panel e2e     29/29
designer e2e  30/30
selftest      67 passed / 6 skipped
package tests 9 groups (8+5+7+7+7+8+7+8+6 = 63 checks)
```
