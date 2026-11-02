#!/usr/bin/env node
// Set a plugin's UI anchor in cordis.patch.yml without hand-editing YAML.
// Dry run by default; --apply writes with a .bak next to the patch.
// usage: node tools/anchor.mjs <profileDir> --package <pkg> --anchor <top-left|top-right|bottom-left|bottom-right|center> [--apply]
import { readFileSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchFiles } from './lib/patch-files.mjs';
import { safeWritePatch } from './lib/patch-write.mjs';

// --expect 与 manage 同一语义：dry-run 给的指纹与当前内容不符就拒绝写
const expectFlag = () => { const i = process.argv.indexOf('--expect'); return i >= 0 ? process.argv[i + 1] : undefined; };

// The value space belongs to the plugin, not to us: any short token is accepted.
// (We only refuse things that would break the YAML line.)
const isValidAnchor = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_.:-]+$/.test(v);
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const apply = argv.includes('--apply');
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (['--package', '--anchor'].includes(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
const pkgName = val('--package');
const anchor = val('--anchor');
const suggestMode = argv.includes('--suggest');
if (!dir || !pkgName || (!anchor && !suggestMode)) {
  console.error('usage: node tools/anchor.mjs <profileDir> --package <pkg> --anchor <value> [--apply]');
  console.error('       node tools/anchor.mjs <profileDir> --package <pkg> --suggest');
  process.exit(2);
}
const clear = anchor === 'clear' || anchor === 'none';
if (!suggestMode && !clear && !isValidAnchor(anchor)) { console.error('anchor must be 1-40 chars of [A-Za-z0-9_.:-] (or "clear")'); process.exit(2); }

// --suggest: collect anchor values the plugin itself mentions, so the UI can offer real
// choices without us inventing a fixed list.
if (suggestMode) {
  const base = join(dir, 'node_modules', pkgName);
  const found = new Set();
  // Docs may write a bare token; code must quote it. Otherwise `anchor = current.seq` looks
  // like an anchor value, which is exactly the kind of false suggestion that erodes trust.
  const scan = (p, quotedOnly) => {
    try {
      const t = readFileSync(p, 'utf8');
      const quoted = /anchor\s*[:=]\s*['\"]([A-Za-z0-9_.:-]{2,40})['\"]/g;
      const bare = /anchor\s*[:=]\s*([A-Za-z][A-Za-z0-9_-]{1,39})\b/g;
      let m;
      while ((m = quoted.exec(t))) found.add(m[1]);
      if (!quotedOnly) {
        while ((m = bare.exec(t))) if (m[1].indexOf('.') === -1) found.add(m[1]);
        // docs often write "anchor: a   # or b" - the alternate is a real documented value
        const alt = /anchor\s*[:=].{0,60}?\bor\s+([A-Za-z][A-Za-z0-9_-]{1,39})\b/g;
        while ((m = alt.exec(t))) if (m[1].indexOf('.') === -1) found.add(m[1]);
      }
    } catch { /* ignore */ }
  };
  for (const rel of ['README.md', 'readme.md', 'cordis.patch.yml', 'package.json']) scan(join(base, rel), false);
  scan(join(base, 'lib/index.js'), true);
  console.log(JSON.stringify({ package: pkgName, suggestions: [...found].sort() }, null, 2));
  process.exit(0);
}

const patchPath = join(dir, 'cordis.patch.yml');
if (!existsSync(patchPath)) { console.error('no cordis.patch.yml in ' + dir); process.exit(2); }
const text = readFileSync(patchPath, 'utf8');
const lines = text.split(/\r?\n/);

// Locate the row this package owns: the id that appears next to its name in the patch.
const pj = join(dir, 'node_modules', pkgName, 'package.json');
if (!existsSync(pj)) { console.error('package not installed: ' + pkgName); process.exit(2); }
const pjJson = JSON.parse(readFileSync(pj, 'utf8'));
const rowIds = [];
if (pjJson.dsh && pjJson.dsh.bundle && pjJson.dsh.bundle.patch) {
  // B7: dsh.bundle.patch can be a string OR an array, and the row may live in any of the files.
  // The old code took String(array) - ["a.yml","b.yml"] -> "a.yml,b.yml" - so it never opened one.
  for (const pf of patchFiles(join(dir, 'node_modules', pkgName), pjJson.dsh.bundle.patch)) {
    if (!existsSync(pf)) continue;
    const t = readFileSync(pf, 'utf8');
    const re = /-\s*id:\s*([\w.@/-]+)\s*\n\s*name:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(t))) if (m[2] === pkgName || m[2].indexOf(pkgName + '/') === 0) rowIds.push(m[1]);
    if (!rowIds.length) { const any = /-\s*id:\s*([\w.@/-]+)/g; let m2; while ((m2 = any.exec(t))) rowIds.push(m2[1]); }
    if (rowIds.length) break;
  }
}
if (!rowIds.length) { console.error('cannot determine the loader row id for ' + pkgName); process.exit(2); }
const row = rowIds[0];

const rowRe = new RegExp('^\\s*-?\\s*id:\\s*' + row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
let rowIdx = lines.findIndex((l) => rowRe.test(l));
// B7: a plugin that ships its own patch has no profile row, so "add it there first" made anchor
// unusable exactly when two plugins fight over one slot. Insert the override instead.
if (rowIdx === -1) {
  if (clear) { console.error('row ' + row + ' has no profile override to clear'); process.exit(3); }
  const appended = text.replace(/\s*$/, '') + '\n- id: ' + row + '\n  config:\n    anchor: ' + anchor + '\n';
  console.log('- id: ' + row + '\n  config:\n    anchor: ' + anchor + '\n');
  if (!apply) { console.log('dry run: pass --apply to write this override into cordis.patch.yml'); process.exit(0); }
  try { safeWritePatch(patchPath, appended, { expected: expectFlag() }); } catch (e) { console.error(String(e.message)); process.exit(1); }
  console.log('wrote override for ' + row + ' (backup kept)');
  process.exit(0);
}
const rowIndent = (lines[rowIdx].match(/^\s*/) || [''])[0].length;
let end = lines.length;
for (let i = rowIdx + 1; i < lines.length; i++) {
  const ind = (lines[i].match(/^\s*/) || [''])[0].length;
  if (lines[i].trim() && ind <= rowIndent && /^-\s/.test(lines[i].trimStart())) { end = i; break; }
}

const childIndent = ' '.repeat(rowIndent + 2);
const leafIndent = ' '.repeat(rowIndent + 4);
const configIdx = lines.findIndex((l, i) => i > rowIdx && i < end && l.trim() === 'config:');
const next = lines.slice();
if (configIdx === -1 && !clear) {
  next.splice(rowIdx + 1, 0, childIndent + 'config:', leafIndent + 'anchor: ' + anchor);
} else if (configIdx !== -1) {
  let anchorIdx = -1;
  for (let i = configIdx + 1; i < end; i++) {
    if (/^\s*anchor:/.test(next[i])) { anchorIdx = i; break; }
    if (next[i].trim() && (next[i].match(/^\s*/) || [''])[0].length <= rowIndent + 2) break;
  }
  if (clear) { if (anchorIdx !== -1) next.splice(anchorIdx, 1); }
  else if (anchorIdx === -1) next.splice(configIdx + 1, 0, leafIndent + 'anchor: ' + anchor);
  else next[anchorIdx] = leafIndent + 'anchor: ' + anchor;
}

const out = next.join('\n');
console.log('row: ' + row + '  package: ' + pkgName);
console.log(next.slice(rowIdx, Math.min(rowIdx + 8, next.length)).join('\n'));
if (!apply) { console.log(''); console.log('DRY RUN - re-run with --apply to write.'); process.exit(0); }
// B8: same discipline as manage - parse before and after, refuse instead of corrupting.
try { safeWritePatch(patchPath, out, { expected: expectFlag() }); } catch (e) { console.error(String(e.message)); process.exit(1); }
console.log(''); console.log('written; restart DSH to take effect.');
