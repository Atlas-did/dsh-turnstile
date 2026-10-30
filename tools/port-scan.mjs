#!/usr/bin/env node
// Static port scan: which plugins claim the same fixed port?
// usage: node tools/port-scan.mjs <profileDir> [--json]
// exit 9 when two or more plugins want the same port (they cannot both listen).
import { eachPluginSource } from './plugin-sources.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const VALUE_FLAGS = new Set([]);
const argv = process.argv.slice(2);
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (VALUE_FLAGS.has(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
if (!dir) { console.error('usage: node tools/port-scan.mjs <profileDir> [--json]'); process.exit(2); }

const PATTERNS = [
  /\.listen\(\s*(\d{2,5})/g,
  /\bport\s*[:=]\s*(\d{2,5})/g,
  /['"`](?:https?:\/\/)?(?:127\.0\.0\.1|localhost):(\d{4,5})/g,
];
const SKIP = new Set(['80', '443', '0', '1']);

const byPort = new Map();
eachPluginSource(dir, ({ plugin, file, text }) => {
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const port = m[1];
      if (SKIP.has(port)) continue;
      if (!byPort.has(port)) byPort.set(port, []);
      const hit = byPort.get(port);
      if (!hit.some((h) => h.plugin === plugin)) hit.push({ plugin, file });
    }
  }
});

const conflicts = [...byPort.entries()].filter(([, list]) => list.length > 1);
const findings = conflicts.map(([port, list]) => ({
  severity: 'error',
  plugin: list.map((l) => l.plugin).join(','),
  resource: 'port ' + port,
  message: list.length + ' plugins claim the same fixed port',
  evidence: { file: list.map((l) => l.plugin + '/' + l.file).join(', ') },
  fix: { kind: 'port-config', snippet: 'make the port configurable, or change one plugin to a free port' },
}));

if (wantsJson()) {
  emitJson('port-scan', findings, findings.length ? 9 : 0);
  process.exit(findings.length ? 9 : 0);
}
console.log('profile: ' + dir + '  fixed ports seen: ' + byPort.size);
for (const [port, list] of [...byPort.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const mark = list.length > 1 ? 'CONFLICT' : 'ok';
  console.log('  ' + String(port).padEnd(8) + mark.padEnd(10) + list.map((l) => l.plugin + ' (' + l.file + ')').join(', '));
}
console.log('');
console.log('port conflicts: ' + conflicts.length);
process.exit(findings.length ? 9 : 0);
