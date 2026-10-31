#!/usr/bin/env node
// 从零建一个隔离沙盒：独立的 DSH_HOME、独立的 profile、独立的端口、独立的 state。
//
// 为什么需要它：工具上了 GitHub，但「跑工具的机器」没上——别人 clone 完只能只读检查，
// 不敢试插件。这个脚本把「实验场」变成一条命令，且**永远不碰主 profile**。
//
// usage: node tools/new-sandbox.mjs --root <dir> [--profiles mini,lite] [--port 18770]
//                                   [--dsh-bin <path/to/dsh/lib/bin.js>] [--force]
//
// 产出：
//   <root>/home/profiles/<name>/{package.json,cordis.patch.yml}
//   <root>/state  <root>/logs
//   <root>/START-<NAME>.cmd  <root>/STOP-<NAME>.cmd
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const root = resolve(val('--root') || '');
if (!root || root === resolve('')) { console.error('usage: node tools/new-sandbox.mjs --root <dir> [--profiles mini,lite] [--port 18770] [--dsh-bin <bin.js>]'); process.exit(2); }
const profiles = (val('--profiles') || 'mini').split(',').map((s) => s.trim()).filter(Boolean);
// 空 bundles 的 profile 起不来（宿主没有 web surface）。官方两个 base bundle 是必需的，
// 其余插件留给使用者按需加。
const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
const basePort = Number(val('--port') || 18770);
const dshBin = val('--dsh-bin') || join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const force = argv.includes('--force');

if (existsSync(join(root, 'home')) && !force) {
  console.error('目标已存在：' + join(root, 'home') + '（加 --force 覆盖 profile 模板，不动别的）');
  process.exit(3);
}

const w = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

profiles.forEach((name, i) => {
  const dir = join(root, 'home', 'profiles', name);
  w(join(dir, 'package.json'), JSON.stringify({
    name: 'sandbox-' + name,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: BASE_BUNDLES } },
  }, null, 2) + '\n');
  // 模板默认就是空数组：任何工具追加前都必须先解析（B13 那次的教训）。
  w(join(dir, 'cordis.patch.yml'), '# sandbox profile - 空层\n[]\n');
  const port = basePort + i;
  const ps = [
    '$env:DSH_HOME = "' + join(root, 'home') + '"',
    '$env:DSH_TURNSTILE_STATE = "' + join(root, 'state') + '"',
    '$env:DSH_TURNSTILE_HOME = "' + root + '"',
    'node "' + dshBin + '" ' + name + ' --no-open --port ' + port + ' *> "' + join(root, 'logs', name + '.log') + '"',
  ].join("`n");
  w(join(root, 'scripts', 'start-' + name + '.ps1'), ps + '\n');
  w(join(root, 'START-' + name.toUpperCase() + '.cmd'), 'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\start-' + name + '.ps1"\n');
  console.log('profile  ' + name.padEnd(10) + join(dir, 'package.json'));
  console.log('port     ' + port);
});

mkdirSync(join(root, 'state'), { recursive: true });
mkdirSync(join(root, 'logs'), { recursive: true });
w(join(root, 'sandbox.json'), JSON.stringify({
  createdAt: new Date().toISOString(),
  root, profiles, basePort, dshBin,
  rules: ['不改主 profile', '每个 sandbox 独立 DSH_HOME 与端口', '写操作先备份'],
}, null, 2) + '\n');

const binOk = existsSync(dshBin);
console.log('');
console.log('DSH 入口  ' + dshBin + (binOk ? '' : '   ← 不存在，需要先安装 @deepseek-ai/dsh'));
console.log('启动      ' + join(root, 'START-' + profiles[0].toUpperCase() + '.cmd'));
console.log('规则      这个目录独立于主 profile；升级/实验都在这里做');
process.exitCode = binOk ? 0 : 4;
