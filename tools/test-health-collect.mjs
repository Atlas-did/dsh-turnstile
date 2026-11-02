// 复审 P1：控制台真实健康必须能抓出「声明了但缺包」，且凭据/bridge 走真实路径。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';
import { installTokenFetch } from './lib/test-auth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'hl2-'));
const home = join(tmp, 'dshhome');
const profileDir = join(home, 'profiles', 'p');
mkdirSync(join(profileDir, 'node_modules', 'plug-real'), { recursive: true });
writeFileSync(join(profileDir, 'node_modules', 'plug-real', 'package.json'), JSON.stringify({ name: 'plug-real', version: '1.0.0' }));
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
  name: 'p', version: '0.0.1',
  dependencies: { 'plug-real': 'file:x', 'definitely-missing-plugin': 'file:y' },
  dsh: { profile: { bundles: ['plug-real', 'definitely-missing-plugin'] } },
}));
process.env.DSH_HOME = home;

const server = createConsoleServer({ profileDir, stateDir: join(tmp, 'state'), fixture: false });
installTokenFetch(server.turnstileToken);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const body = await (await fetch(base + '/turnstile/health')).json();
const byId = Object.fromEntries(body.items.map((i) => [i.id, i]));

ok('缺包被真实检出（不再永远说全部可解析）', byId.bundles && byId.bundles.level === 'fail' && /definitely-missing-plugin/.test(byId.bundles.message), JSON.stringify(byId.bundles || {}).slice(0, 90));
ok('已装的包不算缺', !/plug-real/.test(String(byId.bundles && byId.bundles.message)), String(byId.bundles && byId.bundles.message).slice(0, 60));

// 凭据：真实位置是 <DSH_HOME>/.credentials.yaml
writeFileSync(join(home, '.credentials.yaml'), 'apiKey: x\nmodel: y\n');
const body2 = await (await fetch(base + '/turnstile/health')).json();
const cred2 = body2.items.find((i) => i.id === 'credentials');
ok('凭据从 DSH_HOME 读（写进去就变 pass）', cred2 && cred2.level === 'pass' && /2 个键/.test(cred2.message), JSON.stringify(cred2 || {}).slice(0, 80));

// bridge：没安装也没 endpoint → 跳过（不该出现 bridge 项）
ok('未安装 bridge 时不报 bridge', !body2.items.some((i) => i.id === 'bridge'), JSON.stringify(body2.items.map((i) => i.id)));

ok('真实模式的 profile 是真实路径', body2.profile === profileDir, String(body2.profile).slice(-20));
ok('真实模式不标 fixture', body2.fixture !== true);

server.close();
delete process.env.DSH_HOME;
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'HEALTH_REAL2_FAILED ' + fail : 'HEALTH_REAL2_OK');
process.exitCode = fail ? 1 : 0;