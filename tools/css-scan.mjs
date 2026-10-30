#!/usr/bin/env node
// CSS collision scan — deliberately narrow, because guessing CSS out of minified JS produced
// false positives (property access like `.level` looked like a selector).
// Sources: real .css files inside packages, and <style> blocks embedded in JS/HTML.
// usage: node tools/css-scan.mjs <profileDir> [--json]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/css-scan.mjs <profileDir> [--json]'); process.exit(2); }

const pkgPath = join(dir, 'package.json');
if (!existsSync(pkgPath)) { console.error('not a profile: ' + dir); process.exit(2); }
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const CLS = /\.([a-zA-Z][\w-]{2,})\s*[,{]/g;
const byClass = new Map();

function harvest(plugin, file, css) {
  CLS.lastIndex = 0;
  let m;
  while ((m = CLS.exec(css))) {
    const cls = m[1];
    if (!byClass.has(cls)) byClass.set(cls, []);
    const hit = byClass.get(cls);
    if (!hit.some((h) => h.plugin === plugin)) hit.push({ plugin, file });
  }
}

for (const name of Object.keys(pkg.dependencies || {})) {
  const base = join(dir, 'node_modules', name);
  if (!existsSync(base)) continue;
  const walk = (p, depth) => {
    if (depth > 3) return;
    let st; try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { let es; try { es = readdirSync(p); } catch { return; } for (const e of es) if (e !== 'node_modules') walk(join(p, e), depth + 1); return; }
    if (st.size > 2 * 1024 * 1024) return;
    const rel = p.slice(base.length + 1).split(String.fromCharCode(92)).join('/');
    if (p.endsWith('.css')) {
      try { harvest(name, rel, readFileSync(p, 'utf8')); } catch { /* ignore */ }
      return;
    }
    if (p.endsWith('.js') || p.endsWith('.html')) {
      let t; try { t = readFileSync(p, 'utf8'); } catch { return; }
      const re = /<style[^>]*>([\s\S]{0,20000}?)<\/style>/g;
      let m;
      while ((m = re.exec(t))) harvest(name, rel, m[1]);
    }
  };
  walk(base, 0);
}

const shared = [...byClass.entries()].filter(([, list]) => list.length > 1);
const findings = shared.map(([cls, list]) => ({
  severity: 'warning',
  plugin: list.map((l) => l.plugin).join(','),
  resource: '.' + cls,
  message: 'global class defined by ' + list.length + ' plugins',
  evidence: { file: list.map((l) => l.plugin + '/' + l.file).join(', ') },
  fix: { kind: 'scope-css', snippet: 'prefix the class with the plugin id, or scope it under your own root element' },
}));

if (wantsJson()) { emitJson('css-scan', findings, 0); process.exit(0); }
console.log('profile: ' + dir + '  classes seen: ' + byClass.size + '  shared: ' + shared.length);
for (const [cls, list] of shared.slice(0, 20)) console.log('  .' + cls.padEnd(28) + list.map((l) => l.plugin).join(','));
process.exit(0);
