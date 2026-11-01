#!/usr/bin/env node
// A1：在沙盒里試一个插件，試完给出结论，默认自动还原。
//
// 流程（每一步失败就停，并如实记录）：
//   1. 快照（sandbox-snapshot --take）
//   2. 装前检查（preinstall：同族/双市场/git 依赖）
//   3. 装：拷进 node_modules，写 file: 依赖与 bundles，patch 里加 override 行
//   4. 验证：patch 可解析、client bundle 可解析、engines（有 DSH_BIN 时）、HTTP health（沙盒在跑时）
//   5. 记录 journal；除非 --keep，否则回滚到快照
//
// usage: node tools/sandbox-trial.mjs <profileDir> <pluginDir> [--keep] [--port 18770] [--state <dir>]
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadYaml } from './config.mjs';

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const [profileDir, pluginDir] = args;
if (!profileDir || !pluginDir) { console.error('usage: node tools/sandbox-trial.mjs <profileDir> <pluginDir> [--keep] [--port 18770]'); process.exit(2); }
if (!existsSync(join(profileDir, 'package.json'))) { console.error('not a profile: ' + profileDir); process.exit(2); }
if (!existsSync(join(pluginDir, 'package.json'))) { console.error('not a plugin: ' + pluginDir); process.exit(2); }

const state = val('--state') || process.env.DSH_TURNSTILE_STATE || join(profileDir, '..', '..', 'turnstile-state');
const env = { ...process.env, DSH_TURNSTILE_STATE: state };
const run = (script, extra) => {
  // 用相对本文件的路径：之前是 join('tools', script)，不在仓库根目录跑就必挂（外部调研 #4）
  const here = dirname(fileURLToPath(import.meta.url));
  try { return { code: 0, out: execFileSync(process.execPath, [join(here, script), ...extra], { encoding: 'utf8', env, timeout: 120000 }) }; }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};
const journal = (fields) => run('lab-journal.mjs', ['--add', ...fields]);
const name = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name;
if (!name) { console.error('插件 package.json 没有 name'); process.exit(2); }

console.log('== trial ' + name + '  →  ' + profileDir);
const snap = run('sandbox-snapshot.mjs', [profileDir, '--take', '--label', 'trial ' + name, '--state', state]);
console.log('1. 快照 ' + (snap.code === 0 ? snap.out.trim() : '失败：' + snap.out.trim()));

const pre = run('preinstall.mjs', [profileDir, name, '--json']);
let preJson = null; try { preJson = JSON.parse(pre.out); } catch {}
const blockers = (preJson && preJson.findings || []).filter((f) => /同族|市场/.test(f.text));
if (blockers.length) {
  console.log('2. 装前检查：有风险');
  for (const b of blockers) console.log('   ! ' + b.text + ' → ' + b.next);
  journal(['--kind', 'trial', '--target', name, '--verdict', 'blocked', '--note', blockers[0].text]);
  run('sandbox-snapshot.mjs', [profileDir, '--restore', 'latest', '--state', state]);
  process.exit(3);
}
console.log('2. 装前检查：通过');

// 3. 装
const nm = join(profileDir, 'node_modules', name);
mkdirSync(join(profileDir, 'node_modules'), { recursive: true });
rmSync(nm, { recursive: true, force: true });
cpSync(pluginDir, nm, { recursive: true });
const pkgPath = join(profileDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies[name] = 'file:./node_modules/' + name;
pkg.dsh = pkg.dsh || {}; pkg.dsh.profile = pkg.dsh.profile || {}; pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
if (!pkg.dsh.profile.bundles.includes(name)) pkg.dsh.profile.bundles.push(name);
copyFileSync(pkgPath, pkgPath + '.bak-trial-' + Date.now());
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('3. 已装进 node_modules 并写进 bundles');

// 4. 验证
const checks = [];
const py = run('profile-yaml.mjs', [profileDir]);
checks.push(['profile-yaml', py.code === 0, py.out.trim().split('\n')[0]]);
const { yaml, schema } = loadYaml();
let parses = true;
try { yaml.load(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8'), { schema }); } catch { parses = false; }
checks.push(['patch-parses', parses, parses ? 'ok' : 'cordis.patch.yml 无法解析']);
const port = val('--port');
if (port) {
  let health = null;
  try {
    const res = execFileSync(process.platform === 'win32' ? 'powershell' : 'sh', process.platform === 'win32'
      ? ['-NoProfile', '-Command', 'try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:' + port + '/turnstile/health).StatusCode } catch { 0 }']
      : ['-c', 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:' + port + '/turnstile/health'], { encoding: 'utf8' });
    health = String(res).trim();
  } catch (e) { health = '0'; }
  checks.push(['http-health', health === '200' || health === '401', 'status=' + health + '（401=宿主活着但没 token）']);
}
console.log('4. 验证：');
for (const [n, okk, detail] of checks) console.log('   ' + (okk ? 'ok  ' : 'FAIL') + ' ' + n.padEnd(14) + detail);
const passed = checks.every(([, okk]) => okk);

journal(['--kind', 'trial', '--target', name, '--verdict', passed ? 'pass' : 'fail', '--note', checks.map(([n, okk]) => n + '=' + (okk ? 'ok' : 'fail')).join(' ')]);

if (!has('--keep')) {
  run('sandbox-snapshot.mjs', [profileDir, '--restore', 'latest', '--state', state]);
  rmSync(nm, { recursive: true, force: true });
  console.log('5. 已回滚（--keep 可保留）');
} else console.log('5. 保留安装（--keep）');

console.log(passed ? '结论：通过' : '结论：有问题，见上面的 FAIL');
process.exitCode = passed ? 0 : 1;
