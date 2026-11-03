#!/usr/bin/env node
// 能力网关 CLI：看一个 profile 里谁声明了 Windows 能力、能不能通过，以及跑一次判定并记审计。
//
// usage:
//   node tools/windows-gate.mjs <profileDir>                        # 列出所有插件的声明
//   node tools/windows-gate.mjs <profileDir> --check <pkg> <action>  # 判定并写审计
//   node tools/windows-gate.mjs <profileDir> --audit [--last 20]     # 看审计日志
//
// 动作见 lib/windows-gate.js 的 ACTIONS（uia.read / uia.act / input.simulate / fs.watch / proc.enumerate）。
import { resolveStateDir } from './lib/state-root.mjs';
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { declared, decide, auditLine, ACTIONS } from '../plugins/turnstile-popup/lib/windows-gate.js';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
if (!dir) { console.error('usage: node tools/windows-gate.mjs <profileDir> [--check <pkg> <action>] [--audit]'); process.exit(2); }
if (!existsSync(join(dir, 'package.json'))) { console.error('not a profile: ' + dir); process.exit(2); }

const stateDir = resolveStateDir({ profileDir: dir });
const auditFile = join(stateDir, 'windows-audit.jsonl');

if (has('--audit')) {
  if (!existsSync(auditFile)) { console.log('还没有审计记录（' + auditFile + '）'); process.exit(0); }
  const rows = readFileSync(auditFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-(Number(val('--last')) || 20));
  for (const r of rows) {
    let j; try { j = JSON.parse(r); } catch { continue; }
    console.log((j.at || '').slice(0, 19).replace('T', ' ') + '  ' + String(j.verdict).padEnd(6) + String(j.plugin || '').padEnd(28) + j.action + '  — ' + j.reason);
  }
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];

const checkPkg = val('--check');
if (checkPkg) {
  const action = argv[argv.indexOf('--check') + 2];
  const pluginDir = join(dir, 'node_modules', checkPkg);
  if (!existsSync(pluginDir)) { console.error('插件没装：' + checkPkg); process.exit(2); }
  const pluginPkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
  const caps = declared(pluginPkg);
  const verdict = decide(caps, action);
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(auditFile, auditLine({ plugin: checkPkg, action, verdict: verdict.allow ? 'allow' : 'deny', reason: verdict.reason }));
  console.log((verdict.allow ? 'ALLOW' : 'DENY ') + '  ' + checkPkg + ' → ' + action);
  console.log('  ' + verdict.reason);
  process.exit(verdict.allow ? 0 : 3);
}

console.log('windows 能力声明 · ' + dir);
console.log('动作表：' + Object.keys(ACTIONS).join(', '));
console.log('');
console.log('插件'.padEnd(34) + 'uia'.padEnd(7) + 'input'.padEnd(8) + 'fs'.padEnd(6) + 'proc');
let any = false;
for (const name of bundles) {
  const p = join(dir, 'node_modules', name, 'package.json');
  if (!existsSync(p)) continue;
  const caps = declared(JSON.parse(readFileSync(p, 'utf8')));
  if (Object.values(caps).every((v) => v === 'none')) continue;
  any = true;
  console.log(name.padEnd(34) + caps.uia.padEnd(7) + caps.input.padEnd(8) + caps.fs.padEnd(6) + caps.proc);
}
if (!any) console.log('（没有任何插件声明 Windows 能力——这正是默认应该的样子）');
