#!/usr/bin/env node
// D2：启动前自检——端口、目录、DSH 入口、bundles 是否为空。
// 检查项都来自实践：空 bundles 会静默退出、端口占用会启动失败、bin 不存在会 exec null。
//
// usage: node tools/sandbox-verify.mjs --root <sandbox> [--port 18770] [--json]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';

const val = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const root = val('--root');
if (!root) { console.error('usage: node tools/sandbox-verify.mjs --root <sandbox> [--port 18770] [--json]'); process.exit(2); }
const port = Number(val('--port') || 0);
const findings = [];
const add = (level, text, next) => findings.push({ level, text, next });

const home = join(root, 'home');
if (!existsSync(home)) add('fail', '没有 home/：这个目录还不是沙盒', 'node tools/new-sandbox.mjs --root ' + root);
const profilesDir = join(home, 'profiles');
const profiles = existsSync(profilesDir) ? readdirSync(profilesDir) : [];
if (!profiles.length) add('fail', '没有任何 profile', 'node tools/new-sandbox.mjs --root ' + root + ' --profiles mini');

const BASE = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
for (const name of profiles) {
  const pkgPath = join(profilesDir, name, 'package.json');
  if (!existsSync(pkgPath)) { add('fail', name + ' 缺 package.json', ''); continue; }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  if (!bundles.length) add('fail', name + ' 的 bundles 是空的（宿主会静默退出）', '至少加 ' + BASE.join(' 和 '));
  else if (!BASE.every((b) => bundles.includes(b))) add('warn', name + ' 缺基础 bundle', '补 ' + BASE.filter((b) => !bundles.includes(b)).join(', '));
  const patch = join(profilesDir, name, 'cordis.patch.yml');
  if (!existsSync(patch)) add('warn', name + ' 没有 cordis.patch.yml', '写一个空层 []');
}

const bin = join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const binAlt = val('--dsh-bin') || process.env.DSH_BIN || '';
if (!existsSync(binAlt || bin)) add('fail', '找不到 DSH 入口', '装 @deepseek-ai/dsh 到 runtime/，或用 --dsh-bin 指定');

const checkPort = (p) => new Promise((resolve) => {
  const s = createConnection({ host: '127.0.0.1', port: p });
  s.setTimeout(700);
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('timeout', () => { s.destroy(); resolve(false); });
  s.once('error', () => resolve(false));
});

(async () => {
  if (port) {
    const busy = await checkPort(port);
    if (busy) add('warn', '端口 ' + port + ' 已有进程在听', '如果那是本沙盒就没事；否则换端口');
    else add('pass', '端口 ' + port + ' 空闲', '');
  }
  if (!findings.some((f) => f.level === 'fail')) add('pass', '可以启动', '');
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ root, port, findings }, null, 1)); }
  else {
    console.log('sandbox-verify · ' + root);
    for (const f of findings) console.log('  ' + (f.level === 'pass' ? '✓' : f.level === 'warn' ? '!' : '✗') + ' ' + f.text + (f.next ? '\n     → ' + f.next : ''));
    console.log(findings.some((f) => f.level === 'fail') ? '结论：不能启动' : '结论：可以启动');
  }
  process.exitCode = findings.some((f) => f.level === 'fail') ? 1 : 0;
})();
