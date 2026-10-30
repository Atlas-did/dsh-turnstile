#!/usr/bin/env node
// Audit any DSH profile: deps vs bundles, import health, UI inject map. Read-only.
// Import classification:
//   HARD  = a module that no host provides (real defect, e.g. @monotykamary/*)
//   HOST  = @deepseek-ai/* 缺失：这类包由运行时提供，独立 node 里当然解析不到
//   env   = 插件加载时就要宿主服务（ctx.*），离开宿主必然失败
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const dir = process.argv[2] || ((process.env.DSH_HOME || '') + '/profiles/desktop');
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const bundles = (pkg.dsh?.profile?.bundles) || [];
const nm = join(dir, 'node_modules');

function classify(msg) {
  const miss = msg.match(/Cannot find (?:package|module) '([^']+)'/);
  if (miss) return miss[1].startsWith('@deepseek-ai/') ? 'HOST(运行时提供)' : 'HARD(缺包)';
  if (/cannot load|service|ctx\.|cordis/i.test(msg)) return 'env(需宿主)';
  return 'HARD(其他)';
}

const rows = [];
for (const d of deps) {
  const pj = join(nm, d, 'package.json');
  if (!existsSync(pj)) { rows.push({ d, v: '-', b: bundles.includes(d), load: 'NOT-INSTALLED' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const inj = ((j.dsh && j.dsh.client && j.dsh.client.inject) || []).map(s => s.replace('@deepseek-ai/dsh-client-', ''));
  let load = 'ok';
  try {
    const main = j.main || j.module || 'index.js';
    const entry = join(nm, d, main.replace(/^\.\//, ''));
    if (existsSync(entry)) await import(pathToFileURL(entry).href);
    else load = 'no-entry(CLI 型)';
  } catch (e) {
    const m = String(e.message).replace(/\s+/g, ' ');
    load = classify(m) + ' :: ' + m.slice(0, 70);
  }
  rows.push({ d, v: j.version, b: bundles.includes(d), inj: inj.join(','), load });
}

console.log('profile: ' + dir);
console.log('deps=' + deps.length + '  bundles=' + bundles.length);
console.log('');
console.log('NAME'.padEnd(32) + 'VER'.padEnd(11) + 'BUNDLED'.padEnd(9) + 'LOAD');
for (const r of rows.sort((a, b) => a.d.localeCompare(b.d)))
  console.log(String(r.d).padEnd(32) + String(r.v).padEnd(11) + (r.b ? 'yes' : 'NO').padEnd(9) + r.load);

const hard = rows.filter(r => String(r.load).startsWith('HARD'));
console.log('');
console.log('HARD (真正的缺陷): ' + hard.length);
hard.forEach(r => console.log('  ! ' + r.d + ' :: ' + r.load));
console.log('HOST/env (不是缺陷): ' + rows.filter(r => /^(HOST|env)/.test(String(r.load))).length);
console.log('installed but NOT bundled: ' + rows.filter(r => r.b === false).length);
if (wantsJson()) {
  const findings = hard.map((r) => ({
    severity: 'error',
    plugin: r.d,
    resource: r.load,
    message: 'module cannot be resolved even before restart',
    evidence: { file: r.d + '/package.json' },
  }));
  emitJson('import-health', findings, hard.length ? 5 : 0);
  process.exit(hard.length ? 5 : 0);
}
process.exitCode = hard.length ? 5 : 0;