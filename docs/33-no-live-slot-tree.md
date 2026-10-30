# Why there is no live slot tree

Goal item 9 asked for a slot tree in the panel. The experiment below explains why the shipped
panel shows static UI surfaces (`uiN`) instead of a live tree.

## What was tried

A client plugin receives `ctx.slots`, a `SlotRegistry`. Its prototype exposes:

    entries, entriesOfSlot, snapshot, spec, register, registerFactory, inject, renderSlot,
    install, installScope, provideRoot, subscribe, getVersion, ...

So introspection looked possible. Probed at runtime from inside the panel plugin:

    entries()                    -> []            (0 entries)
    entriesOfSlot('shell.overlay')                -> 0
    entriesOfSlot('settings.section')             -> 0
    entriesOfSlot('conversation.composer')        -> 0
    entriesOfSlot('sidebar.panellist')            -> 0
    snapshot()                   -> array, length 1

## Conclusion

`ctx.slots` is a **scoped** registry view: a plugin sees its own scope, not the global set of
registrations made by other plugins (its own `inject("shell.overlay", ...)` lands in a scope
created at render time, which is why even `shell.overlay` reports 0).

This is the same class of limitation as the server-side `toolStream` gap: cordis/DI scoping
prevents a plugin from enumerating what its peers registered.

## What the panel shows instead

Static, file-derived placement data (`tools/slot-scan.mjs`): which UI surfaces each plugin
declares via `dsh.client.inject`, and whether its row declares `slot`/`anchor`/`order`.
That answers "where does this plugin go, and can I move it from config" without pretending
to be a live tree.
