#!/usr/bin/env node
// Static shortcut scan: two plugins registering the same keybinding.
// usage: node tools/shortcut-scan.mjs <profileDir> [--json]
import { eachPluginSource } from './plugin-sources.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
let dir = '';
for (const a of argv) if (!a.startsWith('--')) { dir = a; break; }
if (!dir) { console.error('usage: node tools/shortcut-scan.mjs <profileDir> [--json]'); process.exit(2); }

const RE = /(?:register|registerCommand|keybinding|accelerator|shortcut)\s*\(\s*['"`]([^'"`]*(?:\+|\bctrl\b|\bcmd\b|\balt\b|\bshift\b)[^'"`]*)['"`]/gi;
const byKey = new Map();
eachPluginSource(dir, ({ plugin, file, text }) => {
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text))) {
    const key = m[1].trim().toLowerCase();
    if (key.length > 40) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    const hit = byKey.get(key);
    if (!hit.some((h) => h.plugin === plugin)) hit.push({ plugin, file });
  }
});

const shared = [...byKey.entries()].filter(([, list]) => list.length > 1);
const findings = shared.map(([key, list]) => ({
  severity: 'error',
  plugin: list.map((l) => l.plugin).join(','),
  resource: key,
  message: list.length + ' plugins register the same shortcut',
  evidence: { file: list.map((l) => l.plugin + '/' + l.file).join(', ') },
  fix: { kind: 'rebind', snippet: 'make the shortcut configurable or pick an unused combination' },
}));

if (wantsJson()) { emitJson('shortcut-scan', findings, findings.length ? 9 : 0); process.exit(findings.length ? 9 : 0); }
console.log('profile: ' + dir + '  shortcuts seen: ' + byKey.size);
for (const [key, list] of byKey.entries()) console.log('  ' + (list.length > 1 ? 'CONFLICT' : 'ok').padEnd(10) + key.padEnd(24) + list.map((l) => l.plugin).join(','));
console.log('');
console.log('shortcut conflicts: ' + shared.length);
process.exit(findings.length ? 9 : 0);
