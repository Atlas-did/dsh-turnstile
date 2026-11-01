// 版本兼容矩阵：某个 DSH 版本没装，就只能记 unknown，绝不写「兼容」。
// usage: node tools/compat-matrix.mjs [--mini <root>] [--json] [--versions a,b]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const mini = val('--mini') || process.env.MINI_HOME || 'C:/Users/finef/Desktop/mini-harness';
const versions = (val('--versions') || '0.2.1-rc.3,0.2.1-rc.4,0.2.1-rc.5,0.2.2-alpha.2').split(',').map((s) => s.trim()).filter(Boolean);

// 本机已知的安装点：mini runtime（版本随包）与 profile 自身 node_modules
const installs = [
  { where: 'mini runtime', pkg: join(mini, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), bin: join(mini, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') },
];

function probe(version) {
  for (const inst of installs) {
    if (!existsSync(inst.pkg)) continue;
    let got = '';
    try { got = JSON.parse(readFileSync(inst.pkg, 'utf8')).version; } catch { continue; }
    if (got !== version) continue;
    // 装了才算有机会验证：真的跑一次 dump-config
    try {
      execFileSync(process.execPath, [inst.bin, 'mini', '--dump-config'], { encoding: 'utf8', timeout: 180000, env: Object.assign({}, process.env, { DSH_HOME: join(mini, 'home') }) });
      return { version, where: inst.where, status: 'verified', evidence: inst.bin };
    } catch (e) {
      return { version, where: inst.where, status: 'failed', evidence: String((e.stdout || '') + (e.stderr || '')).slice(0, 160) };
    }
  }
  return { version, where: null, status: 'unknown', evidence: '本机未安装该版本，未验证' };
}

const cells = versions.map(probe);
const report = { kind: 'compat-matrix@1', at: new Date().toISOString(), plugin: 'dsh-turnstile', cells };

if (has('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('| 版本 | 状态 | 依据 |');
  console.log('|---|---|---|');
  for (const c of cells) console.log('| ' + c.version + ' | ' + c.status + ' | ' + c.evidence + ' |');
}
process.exitCode = cells.some((c) => c.status === 'failed') ? 1 : 0;