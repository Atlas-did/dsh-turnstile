# Fusion mode: what A can do, and when only B is left

When two plugins fight over the same corner, the tool has two very different answers. This
page states which one is automated and why the other is not.

## A - configuration fusion (automated, `tools/fuse.mjs`)

What it does: gives each plugin on a contested surface a **different** anchor, chosen from that
plugin's own documented values, then writes them through the same path as the panel
(`tools/anchor.mjs`, backup + idempotent).

It succeeds only when all of these hold:

1. every plugin on the surface declares `slot`/`anchor`/`order` (so it can move);
2. every plugin documents at least one anchor value we can read (README / its patch / quoted
   in code);
3. the documented sets contain enough distinct values for everyone.

Measured on the mini profile: `ui-conversation` has 8 plugins and **all 8 are hardcoded**, so A
refuses with a named reason per plugin. That is the honest answer, not a failure of the tool -
it is telling you this conflict is not solvable from configuration.

## B - source-level merge (not automated)

What it would mean: extract both plugins' `lib/` logic, have a model rewrite them as one
package, produce a new plugin plus tests and a rollback path.

Why it is not automated here:

- The output is **new running code** in a user's profile. A bad config change is one `git`-less
  restore away; a bad merged plugin runs on the next boot with whatever bugs it has.
- Closure, state and UI lifecycle are exactly what a rewrite silently changes, and a merge that
  "looks right" in a diff can still break the first render.
- Our own gate would then have to bless code we just generated, which is a much weaker claim
  than blessing code someone else wrote.

So B stays a human-in-the-loop operation. The tool's contribution is the evidence: occupancy,
anchor support, and a named reason why A stopped.

## What the user sees

In the panel, each contested surface has an `错开` (separate) button. Outcome paths:

| outcome | panel shows | written |
|---|---|---|
| all movable, distinct values available | `已错开` | anchors updated, backups kept |
| someone is hardcoded | the first refusal line, e.g. `dsh-better-sidebar declares no slot/anchor/order` | nothing |
| values collide but each plugin documents alternates | `已错开` | later plugin moves to its own second choice |

## Reverting

Every write leaves `<file>.bak-<timestamp>`. Reverting a fusion is copying the newest backup
back over `cordis.patch.yml` - no plugin state is hidden anywhere else.
