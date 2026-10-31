#!/usr/bin/env node
// 两个插件的差异：声明 / 注入面 / patch 行 / 体积。
//
// usage: node tools/diff-plugins.mjs <profileDir> <pkgA> <pkgB> [--json]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { patchFiles } from './lib/patch-files.mjs';

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('--'));
const [profileDir, a, b] = args;
if (!profileDir || !a || !b) { console.error('usage: node tools/diff-plugins.mjs <profileDir> <pkgA> <pkgB> [--json]'); process.exit(2); }

function read(profile, name) {
  const dir = join(profile, 'node_modules', name);
  const pj = join(dir, 'package.json');
  if (!existsSync(pj)) return null;
  const pkg = JSON.parse(readFileSync(pj, 'utf8'));
  const dsh = pkg.dsh || {};
  const injects = (dsh.client && dsh.client.inject) || [];
  const rows = [];
  const files = [];
  for (const f of patchFiles(dir, dsh.bundle && dsh.bundle.patch)) {
    if (!existsSync(f)) continue;
    files.push(f.split(/[\\/]/).pop());
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)) rows.push(m[1]);
  }
  const entry = ['lib/client.js', 'lib/client.mjs', 'dist/client.js'].map((c) => join(dir, c)).find((p) => existsSync(p)) || '';
  const bytes = entry ? statSync(entry).size : 0;
  return { name, version: pkg.version || '', injects, rows, files, entryBytes: bytes, engine: pkg.engines && pkg.engines.dsh, compatibility: dsh.compatibility || null };
}

const A = read(profileDir, a);
const B = read(profileDir, b);
if (!A || !B) { console.error((!A ? a : b) + ' 没装在这个 profile'); process.exit(2); }

const onlyA = (x, y) => x.filter((v) => !y.includes(v));
const shared = (x, y) => x.filter((v) => y.includes(v));

const diff = {
  profile: profileDir,
  a: A, b: B,
  injects: { onlyA: onlyA(A.injects, B.injects), onlyB: onlyA(B.injects, A.injects), shared: shared(A.injects, B.injects) },
  rows: { onlyA: onlyA(A.rows, B.rows), onlyB: onlyA(B.rows, A.rows), shared: shared(A.rows, B.rows) },
  size: { aKB: Math.round(A.entryBytes / 1024), bKB: Math.round(B.entryBytes / 1024) },
};

if (argv.includes('--json')) { console.log(JSON.stringify(diff, null, 1)); process.exit(0); }

const short = (s) => s.replace('@deepseek-ai/dsh-client-', '').replace('@deepseek-ai/', '');
console.log(a + ' @' + A.version + '   ↔   ' + b + ' @' + B.version);
console.log('');
console.log('注入面');
console.log('  共有 ' + (diff.injects.shared.length ? diff.injects.shared.map(short).join(', ') : '无'));
console.log('  仅 ' + a + ' ' + (diff.injects.onlyA.length ? diff.injects.onlyA.map(short).join(', ') : '无'));
console.log('  仅 ' + b + ' ' + (diff.injects.onlyB.length ? diff.injects.onlyB.map(short).join(', ') : '无'));
console.log('');
console.log('patch 行');
console.log('  共有 ' + (diff.rows.shared.join(', ') || '无'));
console.log('  仅 ' + a + ' ' + (diff.rows.onlyA.join(', ') || '无'));
console.log('  仅 ' + b + ' ' + (diff.rows.onlyB.join(', ') || '无'));
console.log('');
console.log('体积  ' + a + ' ' + diff.size.aKB + 'KB   ' + b + ' ' + diff.size.bKB + 'KB');
console.log('引擎  ' + a + ' ' + (A.engine ? JSON.stringify(A.engine) : '未声明') + '   ' + b + ' ' + (B.engine ? JSON.stringify(B.engine) : '未声明'));
