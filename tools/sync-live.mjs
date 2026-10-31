#!/usr/bin/env node
// Copy the repository's plugin files into the profile that is actually running.
//
// The profile's node_modules entry is often a link to a working directory, so editing the repository
// does not change what the harness loads. That mistake was made twice (docs/67, docs/68), so it gets a
// tool: `--check` reports drift and exits 1, the default copies.
//
// usage: node tools/sync-live.mjs <profileDir> [--check] [--json]
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoPlugin = join(dirname(here), 'plugins', 'turnstile-popup');
const asJson = process.argv.includes('--json');
const check = process.argv.includes('--check');
const profileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!profileArg) { console.error('usage: node tools/sync-live.mjs <profileDir> [--check] [--json]'); process.exit(2); }

const liveDir = join(profileArg, 'node_modules', 'turnstile-popup');
if (!existsSync(liveDir)) {
  console.error('no turnstile-popup under ' + profileArg);
  process.exit(2);
}

const FILES = ['lib/index.js', 'lib/client.js', 'lib/console.html', 'lib/console-designer.js', 'lib/console-data.js', 'lib/designer-ops.js', 'lib/toggle-patch.js', 'lib/view-state.js', 'lib/sort-context.js', 'lib/inspector-model.js', 'lib/diff-state.js', 'lib/virtual-window.js', 'lib/txn.js', 'lib/journal.js', 'lib/toggle-text.js', 'lib/capabilities.js', 'lib/history-timeline.js', 'lib/selection.js', 'lib/field-schema.js', 'lib/hooks.js'];

const drift = [];
const copied = [];
for (const rel of FILES) {
  const src = join(repoPlugin, rel);
  const dst = join(liveDir, rel);
  if (!existsSync(src)) continue;
  const a = readFileSync(src);
  const b = existsSync(dst) ? readFileSync(dst) : null;
  const same = b !== null && Buffer.compare(a, b) === 0;
  if (same) continue;
  drift.push({ file: rel, present: b !== null });
  if (!check) {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied.push(rel);
  }
}

const report = {
  profile: profileArg,
  liveDir,
  real: existsSync(liveDir) ? realpathSync(liveDir) : null,
  drifted: drift,
  copied,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 1));
} else if (check) {
  if (!drift.length) console.log('in sync: ' + basename(profileArg) + ' (' + FILES.length + ' files)');
  else {
    console.log('drift in ' + basename(profileArg) + ':');
    for (const d of drift) console.log('  ' + d.file + (d.present ? '' : ' (missing)'));
  }
} else if (!drift.length) {
  console.log('already in sync: ' + basename(profileArg));
} else {
  console.log('synced ' + copied.length + ' file(s) into ' + report.real + '; restart the harness');
}
process.exitCode = check && drift.length ? 1 : 0;
