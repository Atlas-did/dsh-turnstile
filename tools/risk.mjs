// Dependency-risk scan: will this plugin install and load for someone else?
// Idea: a plugin that imports a non-official scope (@someone/x) only works on
// the author's machine unless that package is a real dependency (not a peer).
// usage: node tools/risk.mjs <profileDir>
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { importsOf } from './scan.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const nm = join(dir, 'node_modules');

const OFFICIAL = '@deepseek-ai/';
// Import discovery goes through tools/scan.mjs: a real tokenizer when es-module-lexer
// is installed, regex only as a fallback. The returned evidence tells the reader which
// one produced the finding ('ast' is stronger than 'text').
let lastEvidence = 'text';
function scopes(text) {
  const out = new Set();
  const { specifiers, evidence } = importsOf(text);
  lastEvidence = evidence;
  for (const spec of specifiers) {
    if (!spec.startsWith('@')) continue;
    const scope = spec.split('/').slice(0, 2).join('/');
    if (!scope.startsWith(OFFICIAL) && !scope.startsWith('@cordisjs/')) out.add(scope);
  }
  return out;
}
function jsText(d) {
  const out = [];
  const walk = (p, depth) => {
    if (depth > 2 || out.length > 8) return;
    let st; try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), depth + 1); }
    else if (p.endsWith('.js') && st.size > 40) out.push(readFileSync(p, 'utf8'));
  };
  walk(d, 0);
  return out.join('\n');
}

const rows = [];
for (const name of deps) {
  const d = join(nm, name);
  const pj = join(d, 'package.json');
  if (!existsSync(pj)) { rows.push({ name, level: '?', why: 'not installed' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const declared = new Set(Object.keys(j.dependencies || {}).filter(x => x.startsWith('@')));
  const peers = new Set(Object.keys(j.peerDependencies || {}).filter(x => x.startsWith('@')));
  const imported = scopes((existsSync(join(d, 'lib')) ? jsText(join(d, 'lib')) : '') + jsText(d));
  const missing = [...imported].filter(s => !declared.has(s));
  const peerOnly = [...imported].filter(s => peers.has(s) && !declared.has(s));
  let level = 'GREEN', why = 'only official/public packages';
  if (peerOnly.length) { level = 'RED'; why = 'imports peer-only scope: ' + peerOnly.join(', '); }
  else if (missing.length) { level = 'AMBER'; why = 'imports undeclared scope: ' + missing.join(', '); }
  rows.push({ name, version: j.version, level, why });
}

// For RED/AMBER, suggest the official package with the same basename when the
// runtime ships one — that is the pnpm-alias fix from docs/19.
const runtimeNm = process.env.DSH_RUNTIME_NODE_MODULES || join(process.cwd(), 'node_modules');
const officialRoots = [join(runtimeNm, '@deepseek-ai')];
function officialFor(scope) {
  const base = scope.split('/')[1];
  if (!base) return null;
  for (const root of officialRoots) {
    const pj = join(root, base, 'package.json');
    if (existsSync(pj)) {
      try { return '@deepseek-ai/' + base + '@' + JSON.parse(readFileSync(pj, 'utf8')).version; } catch {}
    }
  }
  return null;
}
for (const r of rows) {
  if (r.level !== 'RED' && r.level !== 'AMBER') continue;
  const m = String(r.why).match(/@[\w.-]+\/[\w.-]+/g);
  if (!m) continue;
  const hints = m.map(s => { const o = officialFor(s); return o ? (s + ' -> ' + o) : null; }).filter(Boolean);
  if (hints.length) r.alias = hints.join(' ; ');
}
const order = { RED: 0, AMBER: 1, GREEN: 2, '?': 3 };
rows.sort((a, b) => (order[a.level] - order[b.level]) || a.name.localeCompare(b.name));
console.log('profile: ' + dir);
console.log('NAME'.padEnd(32) + 'VER'.padEnd(10) + 'LEVEL'.padEnd(8) + 'WHY');
for (const r of rows) {
  console.log(String(r.name).padEnd(32) + String(r.version || '-').padEnd(10) + r.level.padEnd(8) + r.why);
  if (r.alias) console.log(' '.repeat(50) + 'alias hint: ' + r.alias);
}
const counts = rows.reduce((acc, r) => { acc[r.level] = (acc[r.level] || 0) + 1; return acc; }, {});
console.log('');
console.log('import evidence: ' + lastEvidence);
console.log('summary: ' + JSON.stringify(counts));
if (wantsJson()) {
  const findings = rows.filter((r) => r.level !== 'GREEN').map((r) => ({
    severity: r.level === 'RED' ? 'error' : 'warning',
    plugin: r.name + '@' + (r.version || '?'),
    resource: r.why,
    message: r.level,
    evidence: { file: 'node_modules/' + r.name + '/package.json', importEvidence: lastEvidence },
    ...(r.alias ? { fix: { kind: 'npm-alias', snippet: r.alias } } : {}),
  }));
  emitJson('risk', findings, counts.RED ? 6 : 0);
  process.exit(counts.RED ? 6 : 0);
}
process.exitCode = counts.RED ? 6 : 0;