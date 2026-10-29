// tools/ui-surfaces.mjs — who injects/overrides the same UI modules.
// Reads a profile's installed bundles: dsh.client.inject lists and cordis.patch.yml row ids.
// Flags a UI surface touched by >= threshold plugins: that is where a parent button belongs.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const profileDir = process.argv[2];
const threshold = Number(process.argv[3] || process.env.DSH_UI_THRESHOLD || 10);
if (!profileDir) { console.error('usage: node tools/ui-surfaces.mjs <profileDir> [threshold]'); process.exit(2); }
const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const bundles = pj.dsh?.profile?.bundles || [];
const surfaces = new Map();
const add = (ui, who) => { if (!surfaces.has(ui)) surfaces.set(ui, new Set()); surfaces.get(ui).add(who); };
for (const name of bundles) {
  const dir = join(profileDir, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  for (const inj of (j.dsh?.client?.inject || [])) if (/ui-/.test(inj)) add(inj, name);
  const patch = j.dsh?.bundle?.patch;
  if (patch) {
    const pf = join(dir, patch.replace(/^\.\//, ''));
    if (existsSync(pf)) {
      const txt = readFileSync(pf, 'utf8');
      for (const m of txt.matchAll(/^\s*-?\s*id:\s*(ui-[\w-]+)/gm)) add(m[1], name);
    }
  }
}
const rows = [...surfaces.entries()].map(([ui, s]) => [ui, [...s].sort()]).sort((a, b) => b[1].length - a[1].length);
console.log('profile: ' + profileDir + '   bundles: ' + bundles.length);
console.log('ui surface' + ' '.repeat(18) + 'plugins');
let hot = 0;
for (const [ui, who] of rows) {
  const flag = who.length > threshold ? '  <-- 超过阈值，建议收进母按钮' : '';
  if (who.length > threshold) hot++;
  console.log('  ' + ui.padEnd(26) + String(who.length).padStart(2) + '  ' + who.join(', ') + flag);
}
console.log('surfaces above threshold (' + threshold + '): ' + hot);
process.exit(hot > 0 ? 11 : 0);