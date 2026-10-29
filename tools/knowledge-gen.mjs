#!/usr/bin/env node
// Generate the list of ctx services that THIS runtime actually provides.
// Instead of a hand-maintained allowlist that drifts, read it from the installed packages.
// usage: node tools/knowledge-gen.mjs [--out knowledge/ctx-services.json]
// Requires DSH_BIN (or a local install) so we know which runtime we are describing.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, DSH_BIN } from './config.mjs';
import { runtimeVersion } from './version.mjs';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > 0 ? process.argv[outArg + 1] : join(ROOT, 'knowledge', 'ctx-services.json');

function runtimeRoot() {
  if (!DSH_BIN) return null;
  // <...>/node_modules/@deepseek-ai/dsh/lib/bin.js → <...>/node_modules
  return join(dirname(DSH_BIN), '..', '..', '..');
}

const nm = runtimeRoot();
if (!nm) { console.error('需要 DSH_BIN（或本地安装）来定位 runtime：DSH_BIN=/path/to/@deepseek-ai/dsh/lib/bin.js'); process.exit(2); }

const services = new Map();
const add = (name, source) => {
  if (!name || name.length > 64) return;
  if (!services.has(name)) services.set(name, new Set());
  services.get(name).add(source);
};

// 1) literal ctx.provide("name", ...) across @deepseek-ai/*/lib
function walk(dir, cb, depth = 0) {
  if (depth > 4) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (e !== 'node_modules') walk(p, cb, depth + 1); }
    else if (e.endsWith('.js') && st.size < 8 * 1024 * 1024) cb(p);
  }
}

const pkgDir = join(nm, '@deepseek-ai');
let pkgs = [];
try { pkgs = readdirSync(pkgDir).filter((d) => d.startsWith('dsh') || d === 'cordis'); } catch { pkgs = []; }
for (const pkg of pkgs) {
  const lib = join(pkgDir, pkg, 'lib');
  if (!existsSync(lib)) continue;
  walk(lib, (file) => {
    let txt = '';
    try { txt = readFileSync(file, 'utf8'); } catch { return; }
    for (const m of txt.matchAll(/ctx\.provide\(\s*["']([A-Za-z0-9_.-]+)["']/g)) add(m[1], pkg);
  });
}

// 2) cordis's own Context interface members (the substrate every plugin extends)
const ctxTypes = join(pkgDir, 'cordis', 'lib', 'types', 'context.d.ts');
if (existsSync(ctxTypes)) {
  const t = readFileSync(ctxTypes, 'utf8');
  const block = t.match(/interface Context[^{]*\{([\s\S]*?)\n\}/);
  if (block) {
    for (const m of block[1].matchAll(/^\s{2,}([a-zA-Z_$][\w$]*)\s*[?:]/gm)) add(m[1], 'cordis:Context');
  }
}

const data = {
  dshVersion: runtimeVersion,
  generatedAt: new Date().toISOString(),
  generator: 'tools/knowledge-gen.mjs',
  runtimeNodeModules: nm.split(String.fromCharCode(92)).join('/'),
  packagesScanned: pkgs.length,
  services: [...services.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, src]) => ({ name, seenIn: [...src].slice(0, 4) })),
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n');
console.log('wrote ' + outFile);
console.log('  dsh ' + data.dshVersion + '  services ' + data.services.length + '  packages ' + data.packagesScanned);
