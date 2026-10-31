#!/usr/bin/env node
// Find `!!js` expressions in DSH YAML and actually parse them.
//
// DSH evaluates these as JavaScript. When one is malformed the loader reports a parse error that does
// not name the file, which is how a stray `}` becomes an unactionable toast. This names file:line.
//
// usage: node tools/js-expr-lint.mjs [--root <dir>] [--json]
// exit: 0 all parse | 1 at least one does not | 2 usage
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const root = flag('--root') || join(homedir(), '.dsh');

if (!existsSync(root)) { console.error('no such root: ' + root); process.exit(2); }

const bad = [];
let total = 0;
const files = [];
const walk = (dir, depth) => {
  if (depth > 6) return;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (['.yml', '.yaml'].includes(extname(e.name))) files.push(p);
  }
};
walk(root, 0);

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = /!!js\s+(.*)$/.exec(line);
    if (!m) return;
    total++;
    const expr = m[1].trim();
    try { new Function('return (' + expr + '\n)'); }
    catch (e) { bad.push({ file: f, line: i + 1, expr, error: String(e.message || e).slice(0, 120) }); }
  });
}

if (argv.includes('--json')) console.log(JSON.stringify({ root, total, bad }, null, 1));
else {
  console.log('scanned ' + files.length + ' yaml files, ' + total + ' !!js expression(s)');
  for (const b of bad) console.log('  BAD  ' + b.file.replace(root, '~/.dsh') + ':' + b.line + '  ' + b.error + '\n       ' + b.expr.slice(0, 100));
  if (!bad.length) console.log('all parse');
}
process.exitCode = bad.length ? 1 : 0;
