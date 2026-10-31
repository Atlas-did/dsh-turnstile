#!/usr/bin/env node
// Guided setup: turn "I installed the plugin" into "I am looking at my profile's health"
// with as few decisions as possible. Default is a dry plan; every action is opt-in.
//
// usage: node tools/setup.mjs [--home <dshHome>] [--profile <name>] [--json]
//                                [--install] [--container <name>] [--yes]
// exit: 0 plan printed or actions done | 2 usage | 1 an action failed
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DSH_HOME } from './config.mjs';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const home = val('--home') || DSH_HOME;
const wantJson = has('--json');

if (!existsSync(home)) { console.error('no DSH home at ' + home + ' (pass --home)'); process.exit(2); }
const profilesDir = join(home, 'profiles');
const profiles = existsSync(profilesDir)
  ? readdirSync(profilesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
if (!profiles.length) { console.error('no profiles under ' + profilesDir); process.exit(2); }

let profile = val('--profile');
if (!profile) profile = profiles.includes('mini') ? 'mini' : profiles[0];
if (!profiles.includes(profile)) { console.error('unknown profile ' + profile + ' (have: ' + profiles.join(', ') + ')'); process.exit(2); }
const target = join(profilesDir, profile);

const containerName = val('--container');
const steps = [];

steps.push({ id: 'deps', title: 'install profile dependencies',
  detail: 'pnpm install --prefer-offline  (or npm install) in ' + target,
  command: 'pnpm install --prefer-offline', cwd: target });

steps.push({ id: 'container', title: 'optionally isolate a second DSH home',
  detail: containerName
    ? 'create ' + join(home, 'containers', containerName) + ' and run DSH with DSH_HOME pointing there'
    : 'skipped - pass --container <name> if you want a throwaway home for risky plugins',
  command: containerName ? 'DSH_HOME=' + join(home, 'containers', containerName) + ' dsh' : null });

steps.push({ id: 'gate', title: 'run the gate once',
  detail: 'node tools/preflight.mjs ' + target + '  (12 checks, parallel, 30s each)',
  command: 'node tools/preflight.mjs ' + target });

steps.push({ id: 'map', title: 'look at the topology, not the log',
  detail: 'node tools/gate-map.mjs ' + profile + '  -> state/gate-map-' + profile + '.html',
  command: 'node tools/gate-map.mjs ' + profile });

steps.push({ id: 'panel', title: 'install the management panel into this profile',
  detail: 'copies plugins/turnstile-popup into node_modules, adds the bundle entry and a patch row (backup kept)',
  command: 'node tools/setup.mjs --home ' + home + ' --profile ' + profile + ' --panel --yes' });

steps.push({ id: 'e2e', title: 'prove the panel actually works (real clicks, no JS dispatch)',
  detail: 'node tools/e2e-panel.mjs --log <dsh log> --patch <profile>/cordis.patch.yml --row <a harmless plugin>',
  command: 'node tools/e2e-panel.mjs --log <dsh log> --patch ' + join(target, 'cordis.patch.yml') + ' --row dsh-talk' });

steps.push({ id: 'mode', title: 'enter manage-mini mode in a new conversation',
  detail: 'paste the block from docs/43-manage-mini-mode.md; it tells the agent the read-only checks, the write rules and the reporting shape',
  command: null });

if (wantJson) {
  console.log(JSON.stringify({ home, profile, target, steps }, null, 2));
} else {
  console.log('profile: ' + target);
  console.log('');
  steps.forEach((s, i) => {
    console.log((i + 1) + '. ' + s.title);
    console.log('   ' + s.detail);
    if (s.command) console.log('   $ ' + s.command);
  });
  console.log('');
  console.log('nothing was changed. add --install to run step 1, or --container <name> to reserve a sandbox home.');
}

let failed = 0;
if (has('--install') && has('--yes')) {
  // Windows package managers are .cmd shims: execFile cannot spawn them without a shell (EINVAL),
  // so the probe and the install both go through a shell there.
  const run = (cmd) => (process.platform === 'win32'
    ? execSync(cmd, { stdio: 'inherit' })
    : execFileSync(cmd.split(' ')[0], cmd.split(' ').slice(1), { stdio: 'inherit' }));
  const probe = (name) => { try { run(name + ' --version'); return true; } catch { return false; } };
  const pm = probe('pnpm') ? 'pnpm' : 'npm';
  try {
    process.chdir(target);
    run(pm + (pm === 'pnpm' ? ' install --prefer-offline' : ' install'));
    console.log('dependencies installed with ' + pm);
  } catch (e) {
    console.error('install failed: ' + String(e.message).slice(0, 200));
    failed = 1;
  }
}
if (has('--panel') && has('--yes')) {
  const src = join(ROOT, 'plugins', 'turnstile-popup');
  const dst = join(target, 'node_modules', 'turnstile-popup');
  try {
    execFileSync(process.execPath, ['-e', [
      'const fs=require("fs"),p=require("path");',
      'const src=process.argv[1],dst=process.argv[2],target=process.argv[3];',
      'fs.mkdirSync(p.dirname(dst),{recursive:true});',
      'fs.rmSync(dst,{recursive:true,force:true});',
      'fs.cpSync(src,dst,{recursive:true});',
      'const pkgPath=p.join(target,"package.json"),j=JSON.parse(fs.readFileSync(pkgPath,"utf8"));',
      'j.dependencies=j.dependencies||{};j.dependencies["turnstile-popup"]="link:"+dst;',
      'j.dsh=j.dsh||{};j.dsh.profile=j.dsh.profile||{};j.dsh.profile.bundles=j.dsh.profile.bundles||[];',
      'if(!j.dsh.profile.bundles.includes("turnstile-popup"))j.dsh.profile.bundles.push("turnstile-popup");',
      'fs.copyFileSync(pkgPath,pkgPath+".bak-"+Date.now());',
      'fs.writeFileSync(pkgPath,JSON.stringify(j,null,2)+"\\n");',
      'const patch=p.join(target,"cordis.patch.yml");',
      'if(fs.existsSync(patch)){const t=fs.readFileSync(patch,"utf8");if(!/id:\\s*turnstile-popup/.test(t)){fs.copyFileSync(patch,patch+".bak-"+Date.now());fs.writeFileSync(patch,t.replace(/\\s*$/,"")+"\\n- insert:\\n    - id: turnstile-popup\\n      name: turnstile-popup\\n");}}',
    ].join(''), src, dst, target], { stdio: 'inherit' });
    console.log('panel installed into ' + target + ' (restart DSH to load it)');
  } catch (e) {
    console.error('panel install failed: ' + String(e.message).slice(0, 200));
    failed = 1;
  }
}

if (containerName && has('--yes')) {
  const dir = join(home, 'containers', containerName);
  mkdirSync(dir, { recursive: true });
  console.log('container home ready: ' + dir);
}
process.exit(failed);
