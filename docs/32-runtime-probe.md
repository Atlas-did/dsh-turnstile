# turnstile-probe (host plugin)

The only component that reads **live** DSH state instead of guessing from files.
Install it into a profile you are allowed to break (this project uses `mini`).

## What it reports (GET /turnstile/runtime)

| field | meaning |
|---|---|
| total / active | loader entries vs entries with a running fiber |
| appliedAtUptimeSeconds | how far into process start this plugin was applied (boot cost probe) |
| bootActive | active entries at apply time |
| activatedSinceBoot | entries that got a fiber later (deferred activation, NOT failure) |
| providedAtRuntime | ctx.provide calls: service, time, providing package |
| toolStream | tool/call + tool/result session events (see caveat) |

## Verified on mini (dsh 0.2.1-rc.3)

    active 198 / entries 230     (58 at apply time, 198 later: DSH activates lazily)
    6.664s  webApp          <- @deepseek-ai/dsh-web-app
    6.751s  authorization   <- @deepseek-ai/dsh-authorization
    6.782s  connection      <- @deepseek-ai/dsh-client-connection

## Caveat: toolStream stays empty

session/event is emitted on the **agent's own context**; a plugin applied at the root
context does not receive those events (verified: after a real tool-calling turn the
counter stayed 0). Node-side tool observation would need the agent context, which is not
reachable from a root plugin.

So load order, boot timing, deferred activation, service provisioning and crash
attribution are verified; tool-call streaming is implemented but not observable here.

## Safety

Every hook is wrapped in try/catch, and the ctx.provide wrapper calls the original
function first and only records after it succeeded. mini runs quicktest 10/10 with the
probe enabled - that is the control that lets us keep it.
