# DSH STORE findings, and what was changed

The marketplace automation pruned `Atlas-did/dsh-turnstile` with `SUBMISSION_PACKAGE_AMBIGUOUS`.
Three separate demands, three separate answers.

## 1. "Multiple DSH plugins were found" - a submission problem, not a repo problem

The repository is a toolkit with several example plugins. Only one of them is the product:
`plugins/turnstile-popup`. The others are lab fixtures and stay `private: true`.

Submit this exact path (the store checks a subpath immediately):

    https://github.com/Atlas-did/dsh-turnstile/tree/main/plugins/turnstile-popup

The other three are deliberately not submitted:

| Path | Why not |
|---|---|
| `plugins/demo-anchor-widget` | 60-line test fixture for the drag/anchor loop |
| `plugins/mini-lab-preset` | an example preset that *composes official plugins*; publishing it would look like redistributing other people's packages |
| `plugins/turnstile-probe` | a diagnostic probe, writes a report and exits |

## 2. Compatibility declarations

`plugins/turnstile-popup/package.json` now carries the block the store asked for:

```json
"compatibility": {
  "node": ">=20",
  "dsh": ">=0.2.1-rc.3 <0.3.0",
  "dshReleases": {
    "0.2.1-rc.3": "compatible",
    "0.2.1-rc.4": "unknown",
    "0.2.1-rc.5": "unknown",
    "0.2.2-alpha.2": "unknown"
  }
}
```

Why those values, honestly:

- `0.2.1-rc.3` is the only version this plugin has actually been run on (the lab profile at commit
  `5b8cf4e`);
- the three newer releases have **not** been executed here, so they are `unknown`, not `compatible`.
  Guessing `compatible` to get listed would be the same class of dishonesty as marking an untested
  fixture green.

## 3. "Don't replace protected packages / entry IDs"

Searched the plugin sources for anything that redeclares a protected row:

- `turnstile-popup` registers only its own rows: `turnstile.plugin-list` (slot entry) and the
  `settings.section` entry with id `turnstile`;
- it reads other plugins' rows, never writes them;
- no `@deepseek-ai/*` package is vendored or renamed.

The one file that *declares* official packages is `plugins/mini-lab-preset/preset.patch.yml`
(a preset is literally a list of plugins to compose). That is why it stays unpublished and
`private: true` - using the mechanism is fine, redistributing someone else's plugin list as a
marketplace package is what the rule is protecting against.

## 4. Install / start / uninstall evidence

A disposable profile, from a clean directory, on this machine:

```bash
node tools/setup.mjs --home <tmp> --profile lab --panel --yes   # install
# start the harness against <tmp>, open the URL, panel appears
node tools/lab.mjs <tmp>/profiles/lab --uninstall turnstile-popup  # uninstall
```

Verification that the round trip leaves nothing behind:

```bash
node tools/manage.mjs <profile> --list     # row gone
ls <profile>/node_modules | grep turnstile # empty
```

Recorded in `docs/49-walkthrough.md` with real command output.

## What is still not proven

- Running on 0.2.1-rc.4 / rc.5 / 0.2.2-alpha.2 (no such DSH installed here);
- a macOS or Linux run (everything above is Windows).

Both are `unknown` in the manifest rather than claimed.
