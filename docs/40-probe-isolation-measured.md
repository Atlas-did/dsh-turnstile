# probe isolation: what actually works (measured, Node v25.8.0)

Before writing the hardened probe, this records what the platform can and cannot block. Every
line below was executed on this machine, not inferred.

## Measurements

| Attempt inside `node --permission --allow-fs-read=/tmp` | Result |
|---|---|
| `fs.writeFileSync('/tmp/x')` | blocked, `ERR_ACCESS_DENIED` |
| `child_process.execSync('echo hi')` | blocked, `ERR_ACCESS_DENIED` |
| `http.get('http://127.0.0.1:9/x')` | **not blocked** - the call proceeds and fails only at the socket layer |

So the permission model buys us **fs writes** and **subprocess creation**. It does **not** cover
network. Any claim that it "denies net" is false, and the previous round's note that said so has
been corrected here.

## Consequence for the threat model

A plugin that runs under the permission model still cannot: modify your files, spawn a shell,
or run arbitrary commands. It **can** still phone home with whatever it read. Exfiltration is a
network problem, not a filesystem problem, and no in-process measure fully solves it.

What we can do, in order of strength:

1. **fs-write + child-process denial** via the permission model (measured, works);
2. **network stubs in the worker bootstrap**: before `require(plugin)`, replace
   `dns.lookup/resolve`, `net.connect/Socket`, `http(s).request/get` with throwers. A plugin can
   defeat this by re-requiring internals or shipping a native addon, so it is a barrier, not a
   wall; the report must say so;
3. **empty environment**: start the worker with `DSH_*`, `*_TOKEN`, `*_KEY`, `AWS_*`, `GITHUB_*`
   removed, so nothing valuable is in reach even if a request is made.

## Degradation matrix

| Condition | Isolation applied | Evidence level | Behaviour |
|---|---|---|---|
| `--permission` supported, user did not opt out | permission model + net stubs + clean env | `runtime` | normal |
| permission model unsupported (old Node) | net stubs + clean env | `runtime-untrusted` | run, but the report says it is unconfined |
| `--no-probe-isolation` | nothing | `runtime-untrusted` | run only when explicitly asked; print the reason |
| worker fails to start under `--permission` | fall back to unconfined | `runtime-untrusted` | do not fail the gate; downgrade the evidence and say why |

Rule: **the evidence level never silently improves.** If the isolation we intended was not
applied, findings from the probe are reported at the weaker level, and `--strict` treats them as
coverage-incomplete (the existing exit 3 path), not as a pass.

## What this does not fix

- Native addons and direct syscalls: out of reach for any in-process measure. Only OS-level
  sandboxing (container, `bwrap`, Windows Job Objects) would cover them, which is out of scope
  for a CLI that must run on a user's desktop.
- What a plugin *reads* before we start the stubs (top-level `require` side effects of its own
  dependencies) is partially covered by the clean env plus fs-read allowlist.

## README consequence

The tagline "Install-time gate **and sandbox**" must become "Install-time gate, with a
best-effort isolated probe". The measured limits above go in the Boundaries section verbatim,
including the network sentence - hiding it would be the same false-green this project exists to
prevent.
