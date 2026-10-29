// Version matrix: does every installed plugin actually declare support for the
// runtime we are on? Three states matter:
//   OK           engines.dsh present and satisfied  (loader mounts it)
//   SKIPPED      engines.dsh present and NOT satisfied (loader drops it)
//   UNCERTIFIED  no engines.dsh, but dsh.compatibility excludes this version
//                -> it runs anyway; nobody tested it. This is the trap class.
// usage: node tools/registry.mjs <profileDir> [runtimeVersion]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const cur = process.argv[3] || '0.2.1-rc.3';
// explicit exemptions written by `dsh plugin allow-version`
let exemptions = {};
try { exemptions = JSON.parse(readFileSync(join(dir, 'compatibility.json'), 'utf8')); } catch {}
const isExempt = (name, version) => {
  const list = exemptions[name + '@' + version];
  return Array.isArray(list) && list.includes(cur);
};

function parse(v) {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' };
}
function cmp(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}
function satisfiesOne(v, range) {
  // caret/tilde produce an implied upper bound; expand before comparing
  if (/^[\^~]/.test(range)) {
    const t = parse(range.slice(1));
    if (!t) return true;
    const upper = range[0] === '^'
      ? { major: t.major + 1, minor: 0, patch: 0, pre: '0' }
      : { major: t.major, minor: t.minor + 1, patch: 0, pre: '0' };
    return cmp(v, t) >= 0 && cmp(v, upper) < 0;
  }
  const parts = range.split(/\s+/).filter(Boolean);
  return parts.every((p) => {
    const m = p.match(/^(>=|<=|>|<|=)?(.+)$/);
    if (!m) return true;
    const op = m[1] || '=';
    let raw = m[2];
    if (raw.startsWith('^') || raw.startsWith('~')) raw = raw.slice(1);
    const t = parse(raw);
    if (!t) return true;
    const c = cmp(v, t);
    if (op === '>=') return c >= 0;
    if (op === '<=') return c <= 0;
    if (op === '>') return c > 0;
    if (op === '<') return c < 0;
    return c === 0;
  });
}
function satisfies(ver, range) {
  const v = parse(ver); if (!v) return true;
  return String(range).split('||').map(s => s.trim()).filter(Boolean).some(r => satisfiesOne(v, r));
}

const rows = [];
for (const name of Object.keys(pkg.dependencies || {})) {
  const pj = join(dir, 'node_modules', name, 'package.json');
  if (!existsSync(pj)) { rows.push({ name, version: '-', state: 'MISSING', note: 'not installed' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const gate = j.engines && j.engines.dsh;
  const decl = j.dsh && j.dsh.compatibility && j.dsh.compatibility.dsh;
  let state = 'UNDECLARED', note = '';
  if (gate) {
    if (satisfies(cur, gate)) { state = 'OK'; note = 'engines ' + gate; }
    else if (isExempt(name, j.version)) { state = 'EXEMPTED'; note = 'explicit exemption for ' + cur; }
    else { state = 'SKIPPED'; note = 'engines ' + gate; }
  } else if (decl) {
    if (satisfies(cur, decl)) { state = 'OK'; note = 'compat ' + decl.slice(0, 40); }
    else { state = 'UNCERTIFIED'; note = 'compat excludes ' + cur; }
  }
  rows.push({ name, version: j.version, state, note });
}

const order = { SKIPPED: 0, UNCERTIFIED: 1, MISSING: 2, EXEMPTED: 3, UNDECLARED: 3, OK: 4 };
rows.sort((a, b) => (order[a.state] - order[b.state]) || a.name.localeCompare(b.name));
console.log('runtime ' + cur + '   profile ' + dir);
console.log('STATE'.padEnd(14) + 'PLUGIN'.padEnd(34) + 'VER'.padEnd(10) + 'NOTE');
for (const r of rows) console.log(String(r.state).padEnd(14) + String(r.name).slice(0, 33).padEnd(34) + String(r.version).padEnd(10) + r.note.slice(0, 44));
const counts = rows.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {});
console.log('');
console.log('summary: ' + JSON.stringify(counts));
process.exit(counts.SKIPPED || counts.MISSING || counts.UNCERTIFIED ? 8 : 0);