// Provision 最小 schema：只读探测、两层卡、digest 与 stale（方案 docs/186）。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { probeMachine, probeProfile, staleness, digestOf, CAPABILITY_STATES } from './provision.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'prov-'));
const dshRoot = join(tmp, 'dsh');
mkdirSync(join(dshRoot, 'lib'), { recursive: true });
writeFileSync(join(dshRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.3' }));
writeFileSync(join(dshRoot, 'lib', 'bin.js'), '// stub');
const profileDir = join(tmp, 'profile');
mkdirSync(join(profileDir, 'node_modules', 'plug-a'), { recursive: true });
writeFileSync(join(profileDir, 'node_modules', 'plug-a', 'package.json'), JSON.stringify({ name: 'plug-a', version: '1.0.0' }));
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1', dsh: { profile: { bundles: ['plug-a', 'plug-missing'] } } }));
writeFileSync(join(profileDir, 'cordis.patch.yml'), '- id: plug-a\n');
const env = { DSH_BIN: join(dshRoot, 'lib', 'bin.js'), DSH_HOME: join(tmp, 'home'), USERPROFILE: tmp };

const m1 = probeMachine(env);
ok('机器快照带 schema 与 digest', m1.kind === 'turnstile/machine-snapshot@1' && /^[a-f0-9]{16}$/.test(m1.probeDigest));
ok('从 DSH_BIN 读出真实版本', m1.dsh.version === '0.2.1-rc.3' && m1.dsh.source === 'package.json', m1.dsh.version);
ok('没有 DSH_BIN 时版本是 unknown', probeMachine({ USERPROFILE: tmp }).dsh.version === '', 'empty');
ok('能力探测全部如实 unknown（没有副作用调用）', Object.values(m1.capabilities).every((c) => c.state === 'unknown' && c.missingReason), JSON.stringify(Object.keys(m1.capabilities)));
ok('能力状态用统一词表', Object.values(m1.capabilities).every((c) => CAPABILITY_STATES.includes(c.state)));
const m2 = probeMachine(env);
ok('同一环境 digest 稳定', m1.probeDigest === m2.probeDigest, m1.probeDigest + ' vs ' + m2.probeDigest);

const card = probeProfile(profileDir, m1, env);
ok('卡片引用机器 digest', card.machineDigest === m1.probeDigest);
ok('卡片自带 digest', /^[a-f0-9]{16}$/.test(card.cardDigest));
ok('插件安装状态真实', card.plugins.find((p) => p.name === 'plug-a').installed === true && card.plugins.find((p) => p.name === 'plug-missing').installed === false);
ok('slot 来源默认 unknown（不假装有观测）', card.slots.source === 'unknown');
ok('同一 profile 两次探测 digest 稳定', probeProfile(profileDir, m1, env).cardDigest === card.cardDigest);

ok('当前机器 → 不 stale', staleness(card, m1).isStale === false);
const other = Object.assign({}, m1, { probeDigest: 'ffffffffffffffff' });
ok('机器 digest 变化 → stale', staleness(card, other).isStale === true && /机器快照/.test(staleness(card, other).reason));
const otherRt = Object.assign({}, m1, { dsh: Object.assign({}, m1.dsh, { runtimeRoot: '/elsewhere' }) });
ok('运行时变化 → stale', staleness(card, otherRt).isStale === true);

// CLI：不加 --write 不落盘
const stateDir = join(tmp, 'state');
const run = (args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [join(here, 'provision.mjs'), ...args], { env: Object.assign({}, process.env, env) });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const dry = await run([profileDir, '--state', stateDir]);
ok('不加 --write 时不创建 state 目录', dry.code === 0 && !existsSync(join(stateDir, 'provision')));
const wrote = await run([profileDir, '--state', stateDir, '--write']);
const files = existsSync(join(stateDir, 'provision')) ? readdirSync(join(stateDir, 'provision')) : [];
ok('--write 写出机器与卡片两个文件', wrote.code === 0 && files.length === 2, JSON.stringify(files));
const check = await run([profileDir, '--state', stateDir, '--check']);
ok('--check 报 current', check.code === 0 && /"current"/.test(check.out), check.out.slice(0, 60));

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'PROVISION_FAILED ' + fail : 'PROVISION_OK');
process.exitCode = fail ? 1 : 0;