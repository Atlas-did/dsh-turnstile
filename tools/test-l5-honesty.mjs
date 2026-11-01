// P0-1 行为反例：空/坏 health 数据绝不能判成 L5 通过。
// 注意：这里必须用异步子进程——execFileSync 会阻塞本进程，导致同进程内的假服务器无法响应。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// 用 spawn 而不是 execFile 的 promisify：后者在子进程非零退出时给的对象形状不稳定
function run(file, args) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => resolve({ stdout: out, stderr: err }));
  });
}
const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'tools', 'verify-live.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'l5-'));
const profileDir = join(tmp, 'profile');
mkdirSync(join(profileDir, 'node_modules', 'plug-a'), { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1', dependencies: { 'plug-a': 'file:x' }, dsh: { profile: { bundles: ['plug-a'] } } }));
writeFileSync(join(profileDir, 'node_modules', 'plug-a', 'package.json'), JSON.stringify({ name: 'plug-a', version: '1.0.0', main: 'index.js' }));
writeFileSync(join(profileDir, 'node_modules', 'plug-a', 'index.js'), 'export function apply() {}');

function serve(healthBody, status = 200) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (req.url.startsWith('/turnstile/health')) { res.writeHead(status, { 'content-type': 'application/json' }); return res.end(healthBody); }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>plug-a</h1>');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
// 造一份结构合法的真实宿主证据，让 L2 通过（这样 L3/L5 才有意义）
const evFile = join(tmp, 'evidence.json');
writeFileSync(evFile, JSON.stringify({
  schema: 'turnstile/host-evidence@1', scope: 'real-dsh-host', realDsh: true,
  target: 'plug-a', profile: profileDir, capturedAt: new Date().toISOString(),
  host: { kind: 'dsh', runtimeVersion: '0.2.1-rc.3', runtimeBin: join(tmp, 'bin.js'), processId: 4242, bootId: 'after-boot' },
  restart: { observed: true, beforeBootId: 'before-boot', afterBootId: 'after-boot' },
  installation: { packageJson: true, bundleListed: true },
  route: { path: '/plug-a', status: 200, bodyBytes: 16, bodySha256: 'a'.repeat(64), bodyExcerpt: 'plug-a' },
}));
async function verify(port) {
  const args = [tool, profileDir, '--pkg', 'plug-a', '--host-evidence', evFile, '--base', 'http://127.0.0.1:' + port, '--token', 't', '--routes', '/plug-a', '--expect', 'plug-a', '--json'];
  const { stdout, stderr } = await run(process.execPath, args);
  const s = String(stdout || '') + String(stderr || '');
  return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
}

let srv = await serve(JSON.stringify({ items: [] }));
let j = await verify(srv.address().port);
let l5 = j.levels.find((l) => l.level === 'L5');
ok('空健康项不能判 L5 通过', l5.status !== 'pass', l5.status);
ok('空健康项不能得出 verified-with-regression', j.claim !== 'verified-with-regression', j.claim);
srv.close();

srv = await serve('{}', 500);
j = await verify(srv.address().port);
ok('health 非 2xx 记 unknown', j.levels.find((l) => l.level === 'L5').status === 'unknown');
srv.close();

srv = await serve(JSON.stringify({ items: [{ id: 'credentials', level: 'pass' }] }));
j = await verify(srv.address().port);
ok('无基线时 claim 停在 verified', j.claim === 'verified', j.claim);
const l5noBase = j.levels.find((l) => l.level === 'L5');
ok('无基线时 L5 是 unknown（不是 pass）', l5noBase.status === 'unknown', l5noBase.status);
ok('无基线时 deepest 停在 L4', j.deepest === 'L4', String(j.deepest));
ok('字段自洽：deepest 不到 L5 就不该是 ok + next 为空', !(j.deepest === 'L5' && j.next.length === 0));
ok('无基线时说明没做对比', /基线|未做/.test(j.claimText), j.claimText.slice(0, 34));
srv.close();

srv = await serve(JSON.stringify({ items: [{ id: 'bundles', level: 'fail' }] }));
j = await verify(srv.address().port);
ok('健康项 fail → L5 fail', j.levels.find((l) => l.level === 'L5').status === 'fail');
srv.close();

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'L5_HONESTY_FAILED ' + fail : 'L5_HONESTY_OK');
process.exitCode = fail ? 1 : 0;