#!/usr/bin/env node
// Walk the beginner-tutorial setup and report which steps are actually in place.
// usage: node tools/setup-check.mjs [--profile desktop] [--json]
// exit: 0 all pass | 1 something failed | 2 usage
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { checkBridge, checkCredentials, checkPluginEnabled, summarize } from './setup-checks.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);

const home = process.env.DSH_HOME || join(homedir(), '.dsh');
const profile = flag('--profile') || 'desktop';
const profileDir = join(home, 'profiles', profile);
const results = [];

if (!existsSync(profileDir)) { console.error('profile not found: ' + profileDir); process.exit(2); }

// 1. credentials (the tutorial's "API 配好了吗")
const credFile = join(home, '.credentials.yaml');
let keys = [];
if (existsSync(credFile)) {
  keys = readFileSync(credFile, 'utf8').split(/\r?\n/).map((l) => (/^([A-Za-z0-9._-]+)\s*:/.exec(l) || [])[1]).filter(Boolean);
}
results.push(checkCredentials({ exists: existsSync(credFile), keys }));

// 2. bridge endpoint (the tutorial's Agent Anywhere step)
const endpoint = join(homedir(), '.agents-anywhere', 'dsh-bridge', 'endpoint.json');
results.push(checkBridge({
  path: endpoint,
  exists: existsSync(endpoint),
  mtimeMs: existsSync(endpoint) ? statSync(endpoint).mtimeMs : 0,
}));

// 3. the plugins the tutorial says to install
// The tutorial names one market package; the machine may already carry another. Either counts.
const want = [['dshmarket', '@ace-zone/dsh-market'], 'dsh-free-search', ['@agents-anywhere/dsh-bridge-next']];
for (const entry of want) {
  const names = Array.isArray(entry) ? entry : [entry];
  const name = names.find((n) => existsSync(join(profileDir, 'node_modules', n))) || names[0];
  const installed = existsSync(join(profileDir, 'node_modules', name));
  const patch = existsSync(join(profileDir, 'cordis.patch.yml')) ? readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8') : '';
  const disabled = new RegExp('id:\\s*' + name + '\\s*\\n\\s*disabled:\\s*true').test(patch);
  results.push(checkPluginEnabled({ name, installed, disabled }));
}

const summary = summarize(results);
if (has('--json')) {
  console.log(JSON.stringify({ profile, summary, results }, null, 1));
} else {
  console.log('setup check · ' + profile + '  (' + profileDir + ')');
  for (const r of results) {
    const tag = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' }[r.level];
    console.log('  ' + tag + '  ' + r.message);
    if (r.next) console.log('        → ' + r.next);
  }
  console.log('结果: ' + summary.pass + ' 通过 / ' + summary.warn + ' 警告 / ' + summary.fail + ' 失败');
}
process.exitCode = summary.fail ? 1 : 0;
