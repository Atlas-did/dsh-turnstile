#!/usr/bin/env node
// Turn findings into an actionable fix plan, and optionally apply it.
// usage: node tools/fix.mjs <profileDir> [--apply] [--json]
// Only findings that carry fix.kind==='npm-alias' are applied today: they become
//   "<offending scope>": "npm:<official package>@<version>"
// in the profile's package.json. Everything else is printed as advice.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/fix.mjs <profileDir> [--apply] [--json]'); process.exit(2); }

let report;
try {
  const out = execFileSync(process.execPath, [join(root, 'tools/preflight.mjs'), dir, '--json', '--no-record'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  report = JSON.parse(out);
} catch (e) {
  // preflight exits 1 when something blocks; its JSON is still on stdout
  try { report = JSON.parse(String(e.stdout || '')); } catch {
    console.error('could not obtain findings from preflight');
    process.exit(3);
  }
}

const findings = (report.checks || []).flatMap((c) => (c.findings || []).map((f) => ({ ...f, checker: c.name })));
const aliasPlan = [];
const advice = [];

for (const f of findings) {
  const fix = f.fix;
  if (!fix) continue;
  if (fix.kind === 'npm-alias' && fix.snippet) {
    for (const part of String(fix.snippet).split(';')) {
      const m = part.trim().match(/^(\S+)\s*->\s*(@?\S+)@(\S+)$/);
      if (!m) continue;
      aliasPlan.push({ from: m[1], to: m[2] + '@' + m[3], dep: 'npm:' + m[2] + '@' + m[3], plugin: f.plugin });
    }
    continue;
  }
  advice.push({ checker: f.checker, plugin: f.plugin, kind: fix.kind, snippet: fix.snippet });
}

const pkgPath = join(dir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};

const todo = aliasPlan.filter((a) => pkg.dependencies[a.from] !== a.dep);

if (argv.includes('--json')) {
  console.log(JSON.stringify({ profile: dir, apply, aliases: todo, advice }, null, 2));
  if (!apply) process.exit(todo.length ? 4 : 0);
} else {
  console.log('fix plan for ' + dir);
  if (!todo.length) console.log('  (no mechanical fix available)');
  for (const a of todo) {
    console.log('  ' + a.from + '  ->  ' + a.dep);
    console.log('        requested by ' + a.plugin);
  }
  if (advice.length) {
    console.log('  advice (not applied automatically):');
    for (const a of advice.slice(0, 10)) console.log('    [' + a.checker + '] ' + a.plugin + ' :: ' + (a.snippet || a.kind));
    if (advice.length > 10) console.log('    ... and ' + (advice.length - 10) + ' more');
  }
}

if (!todo.length) process.exit(0);
if (!apply) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run with --apply to add these aliases.');
  process.exit(4);
}

copyFileSync(pkgPath, pkgPath + '.bak-' + Date.now());
for (const a of todo) pkg.dependencies[a.from] = a.dep;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('');
console.log('applied ' + todo.length + ' alias(es) to package.json; run pnpm install to materialise them.');
