#!/usr/bin/env node
// 装之前先看一眼现状——今天最大的错就是「照教程装了第二个市场，而机器上早有一个」。
//
// usage: node tools/preinstall.mjs <profileDir> <package> [--json]
// exit: 0 可以装 | 1 会撞车/有风险 | 2 用法错
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { duplicateMarkets, gitDependencies, MARKET_PATTERN } from './pits.mjs';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const pkg = argv.filter((a) => !a.startsWith('--'))[1];
if (!target || !pkg) { console.error('usage: node tools/preinstall.mjs <profileDir> <package> [--json]'); process.exit(2); }
if (!existsSync(join(target, 'package.json'))) { console.error('not a profile: ' + target); process.exit(2); }

const profilePkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
const bundles = (profilePkg.dsh && profilePkg.dsh.profile && profilePkg.dsh.profile.bundles) || [];
const deps = profilePkg.dependencies || {};

const alreadyDep = Object.prototype.hasOwnProperty.call(deps, pkg);
const installedDir = join(target, 'node_modules', pkg);
const installed = existsSync(installedDir);
let installedVersion = null;
if (installed) { try { installedVersion = JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8')).version; } catch {} }

// 同名/同族：抓 basename 相同或包含关系，提示「你可能想装的是它」
const short = (n) => String(n).split('/').pop();
// 归一后再比：dsh-market / dshmarket / dsh_market 是同一个东西（今天就栽在这）
const norm = (n) => short(n).toLowerCase().replace(/[-_.]/g, '');
const siblings = bundles.concat(Object.keys(deps))
  .filter((n, i, arr) => arr.indexOf(i) !== -2 && arr.indexOf(n) === i)
  .filter((n) => n !== pkg && norm(n) === norm(pkg));
const targetIsMarket = MARKET_PATTERN.test(pkg);
const existingMarkets = bundles.concat(Object.keys(deps)).filter((n) => MARKET_PATTERN.test(n));

const marketCheck = duplicateMarkets(bundles.map((name) => ({ name })));
const gitCheck = gitDependencies(deps);

const findings = [];
if (bundles.includes(pkg)) findings.push({ level: 'warn', text: pkg + ' 已在 dsh.profile.bundles 里', next: '它已经会随 profile 加载；要换版本先 pnpm remove' });
if (alreadyDep) findings.push({ level: 'warn', text: pkg + ' 已在 dependencies 里（' + deps[pkg] + '）', next: '要升级用 pnpm add ' + pkg + '@<版本>，别重复 add' });
if (installed && !alreadyDep) findings.push({ level: 'warn', text: pkg + ' 的目录已存在但不在 dependencies 里（可能是手工拷贝）', next: '确认来源后再 add，避免两套版本' });
if (siblings.length) findings.push({ level: 'warn', text: '同族包已存在：' + siblings.join(', '), next: '确认不是重复功能的第二个实现（今天我们就是这样装了两个市场）' });
if (targetIsMarket && existingMarkets.length) findings.push({ level: 'warn', text: '这台机器已经有插件市场：' + existingMarkets.join(', '), next: '先想清楚是否真的需要第二个；今天两个市场并存就是这样来的' });
if (gitCheck.level === 'warn') findings.push({ level: 'warn', text: gitCheck.message, next: gitCheck.next });

const result = {
  profile: basename(target), pkg,
  alreadyDependency: alreadyDep, installedInNodeModules: installed, installedVersion,
  siblings, market: marketCheck, git: gitCheck,
  findings, verdict: findings.length ? 'check-first' : 'clear',
};

if (argv.includes('--json')) console.log(JSON.stringify(result, null, 1));
else {
  console.log('preinstall · ' + result.profile + ' ← ' + pkg);
  console.log('  已在 dependencies: ' + alreadyDep + '   node_modules: ' + installed + (installedVersion ? ' (' + installedVersion + ')' : ''));
  console.log('  现有市场: ' + marketCheck.message);
  console.log('  git 依赖: ' + gitCheck.message);
  if (siblings.length) console.log('  同族已存在: ' + siblings.join(', '));
  if (!findings.length) console.log('  结论: clear（可以装）');
  else { console.log('  结论: check-first'); for (const f of findings) console.log('   · ' + f.text + '\n     → ' + f.next); }
}
process.exitCode = findings.length ? 1 : 0;
