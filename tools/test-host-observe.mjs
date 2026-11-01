// 两阶段宿主观察：用临时 mini 目录和真实 HTTP 夹具验证适配器；不启动真实 DSH。
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beginHostObservation, finishHostObservation } from './lib/host-collector.mjs';
import { createMiniHostAdapter } from './lib/mini-host-adapter.mjs';
import { validateHostEvidence } from './lib/host-evidence.mjs';

const root = mkdtempSync(join(tmpdir(), 'host-observe-'));
const mini = join(root, 'mini');
const profile = join(mini, 'home', 'profiles', 'mini');
const target = 'fixture-page';
const runtime = join(mini, 'runtime', 'node_modules', '@deepseek-ai', 'dsh');
mkdirSync(join(runtime, 'lib'), { recursive: true });
mkdirSync(join(profile, 'node_modules', target), { recursive: true });
mkdirSync(join(mini, 'logs'), { recursive: true });
writeFileSync(join(runtime, 'lib', 'bin.js'), '// fixture runtime\n');
writeFileSync(join(runtime, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.3' }));
const profileManifest = { name: 'mini', dsh: { profile: { bundles: [target] } } };
writeFileSync(join(profile, 'package.json'), JSON.stringify(profileManifest));
writeFileSync(join(profile, 'node_modules', target, 'package.json'), JSON.stringify({ name: target, version: '1.0.0' }));
const log = join(mini, 'logs', 'mini.log');
let failed = 0;
let checks = 0;
const ok = (name, condition, detail = '') => {
  checks++;
  console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : ''));
  if (!condition) failed++;
};
const body = '<!doctype html><title>fixture page</title>';
let rootOkay = true;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/') {
    if (!rootOkay || !url.searchParams.get('token')) { res.writeHead(401); res.end('auth'); return; }
    res.writeHead(200); res.end('mini root'); return;
  }
  if (url.pathname === '/fixture-page') { res.writeHead(200); res.end(body); return; }
  res.writeHead(404); res.end('missing');
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
let pid = 1001;
const adapter = createMiniHostAdapter({ mini, findProcess: () => pid });
const setBoot = (token) => writeFileSync(log, `http://127.0.0.1:${port}/?token=${token}\n`);

try {
  setBoot('secret-before');
  let session = await beginHostObservation({ profile, target }, adapter);
  const serialized = JSON.stringify(session);
  ok('before 记录宿主和启动标识', session.schema === 'turnstile/host-observation@1' && session.before.processId === 1001 && session.before.bootId.length === 64);
  ok('observation 不泄露 URL token', !serialized.includes('secret-before'));
  ok('before 记录真实运行时身份', session.runtime.version === '0.2.1-rc.3' && session.runtime.bin.includes('@deepseek-ai'));

  // 模拟受控重启：新 PID + 新 token；after 使用序列化 session，证明无需保存密钥。
  pid = 1002;
  setBoot('secret-after');
  session = JSON.parse(serialized);
  const completed = await finishHostObservation(session, { route: '/fixture-page' }, adapter);
  ok('after 生成完整证据', completed.ok && completed.evidence.host.processId === 1002, completed.errors.join(' | '));
  ok('证据通过统一校验器', validateHostEvidence(completed.evidence, { target, profile }).ok);
  ok('证据不泄露重启前后 token', !JSON.stringify(completed.evidence).includes('secret-before') && !JSON.stringify(completed.evidence).includes('secret-after'));
  ok('路由字节数和哈希来自真实 HTTP 响应', completed.evidence.route.bodyBytes === Buffer.byteLength(body) && completed.evidence.route.bodySha256 === createHash('sha256').update(body).digest('hex'));
  ok('安装与 bundles 来自 profile 文件', completed.evidence.installation.packageJson && completed.evidence.installation.bundleListed);

  const same = await beginHostObservation({ profile, target }, adapter);
  const noRestart = await finishHostObservation(same, { route: '/fixture-page' }, adapter);
  ok('没有新启动时拒绝生成通过证据', !noRestart.ok && noRestart.errors.some((e) => /重启/.test(e)));

  pid = 1003;
  setBoot('secret-third');
  const missing = await finishHostObservation(same, { route: '/missing' }, adapter);
  ok('目标路由 404 不能通过', !missing.ok && missing.evidence.route.status === 404);

  pid = 1004;
  setBoot('secret-fourth');
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'mini', dsh: { profile: { bundles: [] } } }));
  const noBundle = await finishHostObservation(same, { route: '/fixture-page' }, adapter);
  ok('插件不在 bundles 时不能通过', !noBundle.ok && noBundle.evidence.installation.bundleListed === false);
  writeFileSync(join(profile, 'package.json'), JSON.stringify(profileManifest));

  rootOkay = false;
  let rejected = false;
  try { await beginHostObservation({ profile, target }, adapter); } catch { rejected = true; }
  ok('宿主根路由未通过时 before 明确失败', rejected);
  rootOkay = true;

  let outsideRejected = false;
  try { await beginHostObservation({ profile: resolve(root, 'outside'), target }, adapter); } catch { outsideRejected = true; }
  ok('不能把 mini 外 profile 冒充该宿主', outsideRejected);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(failed ? `HOST_OBSERVE_FAILED ${failed}` : `HOST_OBSERVE_OK ${checks} checks`);
process.exitCode = failed ? 1 : 0;
