// 复审 P1-2：验收的异常路径必须真的能写出证据，且默认拒绝覆盖已有安装。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'acceptance-mini.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
function run(args) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [tool, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out }));
  });
}

// 场景 1：profile 的 package.json 坏了 → 预检就抛异常 → 仍要落证据
const tmp = mkdtempSync(join(tmpdir(), 'accfail-'));
const mini = join(tmp, 'mini');
const profileDir = join(mini, 'home', 'profiles', 'mini');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), '{ broken json');
const evFile = join(tmp, 'evidence.json');
const r1 = await run(['acc-broken', '--dir', join(tmp, 'work'), '--mini', mini, '--out', evFile]);
ok('早期异常退出码非 0', r1.code !== 0, String(r1.code));
ok('早期异常仍然写出证据文件', existsSync(evFile));
if (existsSync(evFile)) {
  const ev = JSON.parse(readFileSync(evFile, 'utf8'));
  ok('证据标了 failedEarly', ev.failedEarly === true, JSON.stringify(ev).slice(0, 60));
  ok('证据里有 unexpected-error 步骤', (ev.steps || []).some((s) => s.id === 'unexpected-error'), JSON.stringify((ev.steps || []).map((s) => s.id)));
  ok('证据带阶段标记', typeof ev.phase === 'string' && ev.phase.length > 0, String(ev.phase));
}

// 场景 2：目标已在 bundles 里 → 默认拒绝，不动状态
const tmp2 = mkdtempSync(join(tmpdir(), 'accpre-'));
const mini2 = join(tmp2, 'mini');
const p2 = join(mini2, 'home', 'profiles', 'mini');
mkdirSync(p2, { recursive: true });
writeFileSync(join(p2, 'package.json'), JSON.stringify({ name: 'm', version: '0.0.1', dsh: { profile: { bundles: ['already-here'] } } }));
const before = readFileSync(join(p2, 'package.json'), 'utf8');
const r2 = await run(['already-here', '--dir', join(tmp2, 'work'), '--mini', mini2, '--out', join(tmp2, 'ev.json')]);
ok('目标已存在时退出码 3', r2.code === 3, String(r2.code));
ok('目标已存在时不改 package.json', readFileSync(join(p2, 'package.json'), 'utf8') === before);
ok('拒绝时给出 --overwrite 提示', /--overwrite/.test(r2.out), r2.out.slice(0, 60));

rmSync(tmp, { recursive: true, force: true });
rmSync(tmp2, { recursive: true, force: true });
console.log(fail ? 'ACCEPTANCE_FAILPATH_FAILED ' + fail : 'ACCEPTANCE_FAILPATH_OK');
process.exitCode = fail ? 1 : 0;