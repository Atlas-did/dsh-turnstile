#!/usr/bin/env node
// Static file scan: which plugins write the same absolute path (state file / lock)?
// usage: node tools/file-scan.mjs <profileDir> [--json]
// exit 9 on shared paths.
import { eachPluginSource } from './plugin-sources.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/file-scan.mjs <profileDir> [--json]'); process.exit(2); }

const RE = /(?:writeFileSync|appendFileSync|createWriteStream|writeFile|openSync)\(\s*['"`]([^'"`]{3,200})['"`]/g;
const byPath = new Map();
eachPluginSource(dir, ({ plugin, file, text }) => {
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text))) {
    const p = m[1];
    if (!/[\\/]/.test(p)) continue;
    const norm = p.split('\\\\').join('/').replace(/\/+$/, '');
    if (!byPath.has(norm)) byPath.set(norm, []);
    const hit = byPath.get(norm);
    if (!hit.some((h) => h.plugin === plugin)) hit.push({ plugin, file });
  }
});

const shared = [...byPath.entries()].filter(([, list]) => list.length > 1);
const findings = shared.map(([p, list]) => ({
  severity: 'error',
  plugin: list.map((l) => l.plugin).join(','),
  resource: p,
  message: list.length + ' plugins write the same path',
  evidence: { file: list.map((l) => l.plugin + '/' + l.file).join(', ') },
  fix: { kind: 'namespace-path', snippet: 'scope the path per plugin (e.g. under its own dir) to avoid clobbering' },
}));

if (wantsJson()) { emitJson('file-scan', findings, findings.length ? 9 : 0); process.exit(findings.length ? 9 : 0); }
console.log('profile: ' + dir + '  write paths seen: ' + byPath.size);
for (const [p, list] of byPath.entries()) {
  const mark = list.length > 1 ? 'SHARED' : 'ok';
  console.log('  ' + mark.padEnd(8) + p.slice(0, 60).padEnd(62) + list.map((l) => l.plugin).join(','));
}
console.log('');
console.log('shared write paths: ' + shared.length);
process.exit(findings.length ? 9 : 0);
