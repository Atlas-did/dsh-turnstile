# A reproducible Node crash: `fs.cpSync` out of `node_modules`

The user's console suite reported 55/55. On this machine it produced **no output and exit 127**, and
the project self-test failed `lab install adds the bundle and a row` with exit `3221226505`
(0xC0000409). Both turned out to be the same thing.

## The reproduction, reduced to three files

```js
fs.cpSync('tests/console-fixture/node_modules/plug-alpha', tmp + '/plain', { recursive: true })
```

`plug-alpha` contains exactly two small files (`package.json` 264 B, `cordis.patch.yml` 168 B) and no
symlinks. That call **kills the Node process with no stderr and no stack** - the shell sees exit 127,
the test harness sees a dead child and reports nothing. Node 25.8.0, Windows, this machine.

What does *not* crash:

| Variant | Result |
|---|---|
| `cpSync` of the same tree from a path without `node_modules` | works |
| `cpSync` *to* a destination named `node_modules` | works |
| `readFileSync` + `writeFileSync` walking the tree | works |

So it is the *source path* containing `node_modules`. Most likely a file-system filter (antivirus or
a package-manager guard) intercepting reads out of that directory in this process; the crash is
native, which is why nothing is logged.

## What was changed

`tools/safe-copy.mjs` walks the tree itself:

```js
function copyTreeSafe(src, dst) {
  if (statSync(src).isDirectory()) { for (const n of readdirSync(src)) copyTreeSafe(join(src, n), join(dst, n)); return; }
  copyFileSync(src, dst);
}
```

Three call sites in the test suites now use it instead of `cpSync`, and the `lab` install path was
the same latent bug (it copies a plugin package into a profile).

## Second fix: a click helper that measured zero-sized rows

`click()` read the rect in the same evaluate call as `scrollIntoView`, which returns the *pre-scroll*
rect when the container animates. Every row therefore occasionally measured `0x0` and the step threw
"no clickable coordinates". It now retries up to three times with `scrollIntoViewIfNeeded` and a
120 ms pause before giving up.

## After the fixes, on this machine

| Suite | Before | After |
|---|---|---|
| `test:console` | silent crash (exit 127) | **55/55** |
| `test:designer` | silent crash | **29/29** |
| `test:panel` | not run | **29/29** |
| project self-test | 1 failure (0xC0000409) | **50 passed, 23 skipped** |

The 23 skips are environment cases (no DSH runtime, no browsers for some paths); they are reported as
skips, not passes.

## Why this matters beyond the crash

A silent native crash inside a test fixture is the worst failure mode: the suite exits 0 or dies
without a line, and the report says "no failures". Any test harness that copies `node_modules` - which
is every fixture-based harness - needs to either use this helper or assert that its child process
produced output at all.
