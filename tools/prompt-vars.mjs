// Prompt-variable safety scan (scoped): only the text that becomes a system
// prompt section can throw `unknown prompt variable`. Today that is the
// dsh-persona row's config (prefix/suffix) inside patch or preset YAML.
// usage: node tools/prompt-vars.mjs <profileDir>
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['provider', 'model']);
const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const nm = join(dir, 'node_modules');

function walk(p, d, out) {
  if (d > 3 || out.length > 600) return;
  let st; try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), d + 1, out); }
  else if (/\.(yml|yaml|js|mjs)$/.test(p) && st.size < 4e6) out.push(p);
}

// Extract persona row blocks: from a line containing 'dsh-persona' back to its
// '- id:' and forward to the next '- id:' at the same indentation.
function personaBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/dsh-persona/.test(lines[i])) continue;
    const indent = (lines[i].match(/^\s*/) || [''])[0].length;
    let start = i, end = i;
    for (let j = i; j >= 0; j--) { if (/^\s*-\s+id:/.test(lines[j])) { start = j; break; } }
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const ind = (l.match(/^\s*/) || [''])[0].length;
      if (/^\s*-\s+id:/.test(l) && ind <= indent) { end = j - 1; break; }
      end = j;
    }
    out.push(lines.slice(start, end + 1).join('\n'));
  }
  return out;
}

const rows = [];
for (const name of deps) {
  const d = join(nm, name);
  if (!existsSync(join(d, 'package.json'))) continue;
  const files = []; walk(d, 0, files);
  for (const f of files) {
    let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
    const isYaml = /\.(yml|yaml)$/.test(f);
    if (isYaml && !t.includes('dsh-persona')) continue;
    // JS: only files that register prompt sections, and only {{var}} literals
    if (!isYaml && !t.includes('systemPrompt.section')) continue;
    const blocks = isYaml ? personaBlocks(t) : [t.split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n')];
    for (const block of blocks) {
      const body = block.split(/\r?\n/).filter(l => !/^\s*#/.test(l)).join('\n');
      for (const m of body.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)) {
        if (ALLOWED.has(m[1])) continue;
        rows.push({ name, file: f.slice(d.length + 1).replace(/\\/g, '/'), v: m[1] });
      }
    }
  }
}

console.log('profile: ' + dir + '   (persona sections may only use: ' + [...ALLOWED].join(', ') + ')');
if (!rows.length) { console.log('OK: every persona section uses registered variables'); process.exit(0); }
const agg = new Map();
for (const r of rows) { const k = r.name + ' :: ' + r.file; agg.set(k, (agg.get(k) || 0) + 1); }
for (const [k, n] of agg) console.log('RISK  ' + k + '  (' + n + ')');
console.log('');
console.log('summary: ' + rows.length + ' unsupported reference(s)');
process.exit(7);