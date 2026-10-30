#!/usr/bin/env node
// Lab loop for mini: install / uninstall a small experiment plugin without touching desktop.
// usage: node tools/lab.mjs <profileDir> --install <pluginDir> | --uninstall <packageName>
// Every step is reversible: install copies + adds rows (backups kept), uninstall removes them.
import { cpSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const installSrc = val('--install');
const uninstallPkg = val('--uninstall');
let dir = '';
for (let i = 0; i < argv.length; i++) {
  if (['--install', '--uninstall', '--anchor'].includes(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) { dir = argv[i]; break; }
}
if (!dir || (!installSrc && !uninstallPkg)) {
  console.error('usage: node tools/lab.mjs <profileDir> --install <pluginDir> [--anchor <value>] | --uninstall <name>');
  process.exit(2);
}
const pkgPath = join(dir, 'package.json');
const patchPath = join(dir, 'cordis.patch.yml');
const readPkg = () => JSON.parse(readFileSync(pkgPath, 'utf8'));
const writePkg = (j) => writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n');

if (installSrc) {
  const name = basename(installSrc);
  const srcPkg = join(installSrc, 'package.json');
  if (!existsSync(srcPkg)) { console.error('no package.json in ' + installSrc); process.exit(2); }
  const realName = JSON.parse(readFileSync(srcPkg, 'utf8')).name || name;
  const dst = join(dir, 'node_modules', realName);
  if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
  cpSync(installSrc, dst, { recursive: true });
  const j = readPkg();
  j.dependencies = j.dependencies || {};
  j.dependencies[realName] = 'link:' + dst;
  j.dsh = j.dsh || {}; j.dsh.profile = j.dsh.profile || {}; j.dsh.profile.bundles = j.dsh.profile.bundles || [];
  if (j.dsh.profile.bundles.indexOf(realName) === -1) j.dsh.profile.bundles.push(realName);
  writePkg(j);
  const anchor = val('--anchor');
  // A bundle that declares dsh.bundle.patch already contributes its own rows; adding a profile
  // row as well would declare the same id twice in one scope (a real clash, caught by lint-rows).
  const declaresOwnRows = Boolean(JSON.parse(readFileSync(srcPkg, 'utf8')).dsh && JSON.parse(readFileSync(srcPkg, 'utf8')).dsh.bundle);
  if (declaresOwnRows) {
    // A bundle row can be *overridden* by id from the profile patch - that is the supported
    // way to give a user-specific config without declaring the same id twice.
    if (anchor && existsSync(patchPath)) {
      const t = readFileSync(patchPath, 'utf8');
      const hasOverride = new RegExp('^- id:\\s*' + realName + '\\s*$', 'm').test(t);
      if (!hasOverride) {
        writeFileSync(patchPath, t.replace(/\s*$/, '') + '\n- id: ' + realName + '\n  name: ' + realName + '\n  config:\n    anchor: ' + anchor + '\n');
      }
    }
    console.log('bundle declares its own rows; wrote a config override only' + (anchor ? ' (anchor: ' + anchor + ')' : ''));
  } else if (existsSync(patchPath)) {
    const t = readFileSync(patchPath, 'utf8');
    if (new RegExp('id:\\s*' + realName).test(t)) {
      console.log('already has a patch row; left untouched');
    } else {
      const block = '- insert:\n    - id: ' + realName + '\n      name: ' + realName + '\n' +
        (anchor ? '      config:\n        anchor: ' + anchor + '\n' : '');
      writeFileSync(patchPath, t.replace(/\s*$/, '') + '\n' + block);
    }
  }
  console.log('installed ' + realName + ' into ' + dir + ' (restart DSH)');
  process.exit(0);
}

// uninstall
const dst = join(dir, 'node_modules', uninstallPkg);
if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
const j = readPkg();
if (j.dependencies) delete j.dependencies[uninstallPkg];
if (j.dsh && j.dsh.profile && j.dsh.profile.bundles) j.dsh.profile.bundles = j.dsh.profile.bundles.filter((b) => b !== uninstallPkg);
writePkg(j);
if (existsSync(patchPath)) {
  const lines = readFileSync(patchPath, 'utf8').split(/\r?\n/);
  const out = [];
  let dropping = false;
  for (const line of lines) {
    const m = line.match(/^\s*-\s*id:\s*([\w.@/-]+)\s*$/);
    if (m) dropping = m[1] === uninstallPkg;
    else if (/^-\s/.test(line) && !/^\s/.test(line)) dropping = false;
    if (!dropping) out.push(line);
  }
  let next = out.join('\n');
  if (!/^- /m.test(next)) next = next.replace(/\s*$/, '\n') + '[]\n';
  writeFileSync(patchPath, next);
}
console.log('uninstalled ' + uninstallPkg + ' from ' + dir + ' (restart DSH)');
