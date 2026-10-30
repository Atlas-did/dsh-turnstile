# Proposal: a global slots snapshot API for DSH

Status: **prototype works**; this repo ships a polyfill. Measured on dsh 0.2.1-rc.3 (mini profile, Windows).

## The problem

A client plugin receives `ctx.slots`, a `SlotRegistry`. Everything it can call is scoped to itself:

    ctx.slots.entries()                        -> []   (0 entries)
    ctx.slots.entriesOfSlot('shell.overlay')   -> 0
    ctx.slots.snapshot()                       -> 1 item

But shell.overlay had 14 registrations at that moment. So a plugin cannot answer the two
questions users actually ask: **what is on screen, and which plugin put it there?**

## What the shared store already holds

The scoped registry wraps a shared store. `ctx.slots._core.records` is a Map keyed by slot node;
each value carries spec, declaredBy, parent, declarationEpoch, entries, version, listeners.

Measured on mini:

    slot                      entries   declaredBy
    tool.call.toolview           54     an entry in conversation.chat.node
    conversation.chat.node       20     an entry in conversation.chat.flow
    sidebar.right.pane.tab       15     an entry in rightbar.session
    shell.overlay                14     an entry in root

105 registrations across all nodes. The data is already there and already correct; it is only
not exposed publicly, and it is keyed by a private field name.

## Proposed public API

    interface SlotSnapshotNode {
      slot: string;          // e.g. shell.overlay
      declaredBy: string;    // human-readable origin, already computed today
      parent?: string;       // nearest ancestor slot node
      count: number;
      entries: Array<{ id: string; owner?: string }>;
    }

    interface SlotRegistry {
      snapshotAll(): SlotSnapshotNode[];
      subscribeAll(listener: (snapshot: SlotSnapshotNode[]) => void): () => void;
    }

Two additions only. No new permissions, no new lifecycle: both read state that is already
maintained, and declaredBy is already the exact string a UI wants to print.

## Why it matters

1. **UI ownership** - which plugin owns this corner of the screen is currently unanswerable and
   is the first question asked when two overlays fight.
2. **Diagnostics** - a support tool can render the real tree instead of a file-derived guess
   (this repo's tools/slot-scan.mjs is exactly that guess).
3. **Conflict detection** - two plugins registering the same slot with no anchor/order becomes
   measurable instead of suspected.

## The polyfill shipped here

research/turnstile-popup exposes:

    window.__DSH_SLOTS_SNAPSHOT__()   // -> SlotSnapshotNode[]

It reads ctx.slots._core.records, normalises each node and sorts by count descending. The panel
renders it as the slot tree (screenshot state/popup-slot-tree.png).

## Caveat, stated plainly

The polyfill depends on a private field name (_core.records). That is acceptable for a
diagnostic tool already tied to DSH internals, but it is not something a plugin should build
features on - which is precisely why the public method is worth adding upstream.
