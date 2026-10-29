// Row-scope lint for a DSH profile, parsed from --dump-config by indentation.
// A clash is two entries with the same id *in the same scope*; the same id in
// different presets is legal (preset children are nested groups).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Prefer an explicit DSH_HOME only when it actually contains this profile;
// otherwise use the mini home (the host process often exports ~/.dsh).
function pickHome() {
  const explicit = process.env.DSH_HOME;
  if (explicit && existsSync(join(explicit, 'profiles', profile))) return explicit;
  return join(root, 'home');
}
import { ROOT as root, DSH_BIN, DSH_HOME } from './config.mjs';
const profile = process.argv[2] || 'mini';
const patchIdx = process.argv.indexOf('--patch');
const patchFile = patchIdx > 0 ? process.argv[patchIdx + 1] : null;
const bin = DSH_BIN;
let text = '';
try {
  const args = [bin, profile];
  if (patchFile) args.push('--patch', patchFile);
  args.push('--dump-config');
  text = execFileSync(process.execPath, args, {
    env: { ...process.env, DSH_HOME: pickHome() },
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  text = String(e.stdout || '');
  if (!text) { console.log(JSON.stringify({ ok: false, error: 'dump-config failed' })); process.exit(1); }
}

const entries = [];
const stack = [];   // [{ indent, id }]
for (const line of text.split('\n')) {
  const m = line.match(/^(\s*)- id:\s*([\w.@/-]+)\s*$/);
  if (!m) continue;
  const indent = m[1].length;
  const id = m[2];
  while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
  const scope = stack.length ? stack.map(s => s.id).join('/') : 'root';
  entries.push({ id, indent, scope });
  stack.push({ indent, id });
}

const seen = new Map();
for (const e of entries) {
  const k = e.scope + '::' + e.id;
  seen.set(k, (seen.get(k) || 0) + 1);
}
const clashes = [...seen.entries()].filter(([, n]) => n > 1);
const scopes = new Set(entries.map(e => e.scope));
const ids = new Map();
for (const e of entries) ids.set(e.id, (ids.get(e.id) || new Set()).add(e.scope));
const shared = [...ids.entries()].filter(([, s]) => s.size > 1);

console.log(JSON.stringify({
  profile, entries: entries.length, scopes: scopes.size,
  realClashes: clashes.map(([k, n]) => ({ key: k, count: n })),
  sameIdDifferentScopes: shared.length,
  examples: shared.slice(0, 6).map(([id, s]) => id + ' x' + s.size),
  ok: clashes.length === 0,
}, null, 2));
process.exitCode = clashes.length ? 4 : 0;