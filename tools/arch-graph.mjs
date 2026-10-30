#!/usr/bin/env node
// Turn a profile's occupancy data into an archify architecture diagram.
// usage: node tools/arch-graph.mjs <profileDir> [--out-dir <dir>] [--archify <path to archify.mjs>]
// Writes <out-dir>/candidate.json and prints the exact archify command to render it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (['--out-dir', '--archify'].includes(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
if (!dir) { console.error('usage: node tools/arch-graph.mjs <profileDir> [--out-dir <dir>] [--archify <path>]'); process.exit(2); }
const outDir = val('--out-dir') || join(root, 'state', 'arch');

const occ = JSON.parse(execFileSync(process.execPath, [join(root, 'tools/occupancy.mjs'), dir, '--out', join(outDir, 'occupancy.json')], { encoding: 'utf8' }).length ? readFileSync(join(outDir, 'occupancy.json'), 'utf8') : '{}');
const surfaces = (occ.surfaces || []).slice(0, 6);
const pluginCount = new Map();
for (const s of occ.surfaces || []) for (const p of s.plugins || []) pluginCount.set(p, (pluginCount.get(p) || 0) + 1);
const plugins = [...pluginCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

const components = [];
surfaces.forEach((s, i) => components.push({ id: 's' + i, type: 'frontend', label: s.surface, sublabel: s.count + ' 个插件', pos: [60 + i * 250, 40], size: [200, 64] }));
plugins.forEach(([name, n], i) => components.push({ id: 'p' + i, type: 'backend', label: name, sublabel: n + ' 个面', pos: [60 + i * 250, 220], size: [200, 64] }));
components.push({ id: 'host', type: 'cloud', label: 'DeepSeek Harness', sublabel: '宿主运行时', pos: [60, 400], size: [220, 64] });
components.push({ id: 'patch', type: 'database', label: 'cordis.patch.yml', sublabel: '行配置', pos: [420, 400], size: [220, 64] });
components.push({ id: 'gate', type: 'external', label: 'turnstile 闸门', sublabel: '12 项检查', pos: [780, 400], size: [220, 64] });

const connections = [];
let n = 0;
for (const s of surfaces) {
  const si = surfaces.indexOf(s);
  for (const p of s.plugins || []) {
    const pi = plugins.findIndex(([name]) => name === p);
    if (pi === -1) continue;
    connections.push({ id: 'c' + (n++), from: 'p' + pi, to: 's' + si, variant: 'emphasis' });
  }
}
connections.push({ id: 'host-patch', from: 'host', to: 'patch', label: '读取', fromSide: 'right', toSide: 'left' });
connections.push({ id: 'gate-patch', from: 'gate', to: 'patch', label: '写回（留备份）', fromSide: 'left', toSide: 'right' });

const doc = {
  schema_version: 1, diagram_type: 'architecture',
  meta: { title: 'DeepSeek Harness 插件架构（实验场）', output: 'graph.html', quality_profile: 'showcase', viewBox: [1560, 520] },
  components, connections,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'candidate.json'), JSON.stringify(doc, null, 2) + '\n');
const archify = val('--archify');
console.log('candidate: ' + join(outDir, 'candidate.json') + '  (' + components.length + ' nodes, ' + connections.length + ' edges)');
if (archify) {
  try {
    execFileSync(process.execPath, [archify, 'render', 'architecture', join(outDir, 'candidate.json'), join(outDir, 'graph.html'), '--quality', 'standard'], { stdio: 'inherit' });
    console.log('diagram: ' + join(outDir, 'graph.html'));
  } catch (e) { console.error('archify render failed; candidate kept'); process.exitCode = 1; }
} else {
  console.log('render it with:  archify render architecture ' + join(outDir, 'candidate.json') + ' ' + join(outDir, 'graph.html'));
}
