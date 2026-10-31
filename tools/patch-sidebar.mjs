#!/usr/bin/env node
// Shrink / grow the two sidebar footer actions the user asked about.
//
// Both are third-party client bundles. DSH has no supported way to restyle a slot action, so this edits
// the shipped file in place and keeps a .bak next to it. Upgrading the plugin overwrites the patch - run
// this again after an upgrade, or use --revert before upgrading.
//
// usage: node tools/patch-sidebar.mjs [--apply|--revert] [--profile <dir>]
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const revert = argv.includes('--revert');
const profileIdx = argv.indexOf('--profile');
const profileDir = profileIdx >= 0 ? argv[profileIdx + 1] : join(homedir(), '.dsh', 'profiles', 'desktop');
const nm = join(profileDir, 'node_modules');

const targets = [
  {
    name: 'dsh-mimir (变大)',
    file: join(nm, 'dsh-mimir', 'lib', 'client.js'),
    edits: [
      ['height:28px;color:var(--dsw-alias-label-tertiary', 'height:34px;color:var(--dsw-alias-label-tertiary'],
      ['padding:0 8px;font-size:13px', 'padding:0 14px;font-size:15px'],
      ['border-radius:14px;justify-content:center', 'border-radius:17px;justify-content:center'],
    ],
  },
  {
    name: 'Agents Anywhere (只留图标)',
    file: join(nm, '@agents-anywhere', 'dsh-bridge-next', 'lib', 'client.js'),
    edits: [
      ['label: () => t("远程控制")', 'label: () => ""'],
    ],
  },
];

for (const t of targets) {
  const bak = t.file + '.bak-sidebar';
  if (!existsSync(t.file)) { console.log('skip ' + t.name + ': not installed'); continue; }
  if (revert) {
    if (existsSync(bak)) { copyFileSync(bak, t.file); console.log('reverted ' + t.name); }
    else console.log('nothing to revert for ' + t.name);
    continue;
  }
  if (!existsSync(bak)) copyFileSync(t.file, bak);
  let src = readFileSync(t.file, 'utf8');
  let changed = 0;
  for (const [from, to] of t.edits) {
    if (src.includes(from)) { src = src.split(from).join(to); changed++; }
    else if (src.includes(to)) { /* already patched */ }
    else console.log('  ! pattern not found in ' + t.name + ': ' + from.slice(0, 40));
  }
  if (changed) { writeFileSync(t.file, src); console.log('patched ' + t.name + ' (' + changed + ' edit(s))'); }
  else console.log('no change for ' + t.name);
}

console.log('restart DSH to see it');
