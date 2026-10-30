# Screenshots for the agent (so "move it to the top-left" can be checked)

A user should be able to say *move that to the top-left* and then **see** the result, not read a
log line. `tools/capture.mjs` is the piece that makes that possible.

## Usage

    # whole page
    node tools/capture.mjs --log <dsh log> --out shot.png

    # one element, e.g. the management panel
    node tools/capture.mjs --log <dsh log> --out panel.png --selector '[data-testid="panel"]'

    # one plugin's own widget
    node tools/capture.mjs --log <dsh log> --out widget.png --selector '[data-testid="demo-anchor-widget"]'

Options: `--port`, `--url` (instead of log+port), `--wait ms`, `--full` page.
Exit: `0` captured, `2` usage, `3` could not capture (no browser or selector missing) - a capture
that did not happen is never reported as success.

## Measured

| target | result |
|---|---|
| panel element | 360x468 png, only the panel |
| demo widget | 94x54 png, just the badge |

Element capture is what makes the conversational loop cheap: the agent sends a 3 KB crop
instead of a 140 KB full screenshot.

## The loop this enables

1. user: "把这个挪到左上"
2. agent: `node tools/anchor.mjs <profile> --package <pkg> --anchor top-left --apply`
3. agent: restart DSH
4. agent: `node tools/capture.mjs --selector '[data-testid="<pkg>-widget"]'`
5. agent shows the crop: the badge now says `top-left`

Step 5 is the point. Without it the user has to trust a command's exit code.

## Requirement on plugins

Element capture needs a stable hook. Our own components carry `data-testid`; third-party
plugins usually do not, so for them the agent falls back to full-page or a text locator.
Suggesting `data-testid` to plugin authors is worth doing anyway.
