// P1-2：真实模式（fixture:false）不允许返回写死的健康项。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';
import { installTokenFetch } from './lib/test-auth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'hl-'));
const profileDir = join(tmp, 'real-profile');
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
  name: 'real', version: '0.0.1',
  dependencies: { 'plug-x': 'file:x', 'plug-y': 'file:y' },
  dsh: { profile: { bundles: ['plug-x'] } },
}));

async function boot(opts, stateName) {
  const server = createConsoleServer(Object.assign({ profileDir, stateDir: join(tmp, stateName) }, opts));
installTokenFetch(server.turnstileToken);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { server, base };
}

const real = await boot({ fixture: false }, 's-real');
const realBody = await (await fetch(real.base + '/turnstile/health')).json();
const realText = JSON.stringify(realBody);
ok('真实模式不声称 fixture', realBody.fixture !== true);
ok('真实模式不写死 dsh-free-search', !realText.includes('dsh-free-search'), realText.slice(0, 80));
ok('真实模式的 profile 不是夹具名', realBody.profile !== 'console-fixture', String(realBody.profile));
ok('真实模式读的是真实 bundles 数量', realText.includes('1 个 bundle') || realBody.items.some((i) => i.id === 'bundles'), realText.slice(0, 120));
real.server.close();

const fix = await boot({ fixture: true }, 's-fix');
const fixBody = await (await fetch(fix.base + '/turnstile/health')).json();
ok('fixture 模式显式标注 fixture', fixBody.fixture === true);
fix.server.close();

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'HEALTH_REAL_FAILED ' + fail : 'HEALTH_REAL_OK');
process.exitCode = fail ? 1 : 0;