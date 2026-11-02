// 装前/装后对比：两张快照的差异必须可复算。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const root = mkdtempSync(join(tmpdir(), 'snap-'));
const prof = join(root, 'profiles', 'p');
const state = join(root, 'state');
mkdirSync(join(prof, 'node_modules', 'a'), { recursive: true });
writeFileSync(join(prof, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: ['a'] } } }));
writeFileSync(join(prof, 'cordis.patch.yml'), '- id: a\n  disabled: false\n');
writeFileSync(join(prof, 'node_modules', 'a', 'package.json'), JSON.stringify({ name: 'a', version: '1.0.0', dsh: { client: { inject: ['@deepseek-ai/dsh-client-ui-settings'] } } }));

const run = (...args) => execFileSync(process.execPath, [join(here, 'profile-snapshot.mjs'), prof, ...args], { encoding: 'utf8', env: { ...process.env, DSH_TURNSTILE_STATE: state } });

// 先放一张适配卡：快照必须记录它（方案 186 §6.4）
mkdirSync(join(state, 'provision'), { recursive: true });
writeFileSync(join(state, 'provision', 'profile-p.json'), JSON.stringify({ profile: 'p', cardDigest: 'aaaa1111', machineDigest: 'bbbb2222' }));
process.env.DSH_TURNSTILE_STATE = state;

const t1 = run('--take', '--label', 'before');
ok('take 写出快照', /快照已存/.test(t1) && /1 个插件/.test(t1), t1.trim().split('\n')[1]);
const snap1 = JSON.parse(readFileSync(join(state, 'snapshots', readdirSync(join(state, 'snapshots')).sort()[0]), 'utf8'));
ok('快照记录了适配卡 digest', snap1.provision && snap1.provision.cardDigest === 'aaaa1111', JSON.stringify(snap1.provision));

// 装一个新插件（模拟装后），再拍一张
writeFileSync(join(prof, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: ['a', 'b'] } } }));
mkdirSync(join(prof, 'node_modules', 'b'), { recursive: true });
writeFileSync(join(prof, 'node_modules', 'b', 'package.json'), JSON.stringify({ name: 'b', version: '2.0.0', dsh: { client: { inject: ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-conversation'] } } }));
writeFileSync(join(prof, 'cordis.patch.yml'), '- id: a\n  disabled: false\n- id: b\n  disabled: false\n');
run('--take', '--label', 'after');

const d = JSON.parse(run('--diff', '--json'));
ok('diff 报出新增插件', d.added.includes('b'), d.added.join(','));
ok('diff 报出没有移除', d.removed.length === 0);
ok('diff 报出 UI 面计数变化', d.surfaceDelta.some((x) => x.surface.includes('ui-settings') && x.delta === 1), JSON.stringify(d.surfaceDelta));
ok('diff 报出配置体积增长', d.patchBytes.after > d.patchBytes.before, d.patchBytes.before + '→' + d.patchBytes.after);

const list = run('--list');
ok('list 列出两张快照', (list.match(/个面|插件/g) || []).length >= 2, list.trim().split('\n')[0]);

// 只有一张快照时，diff 要明确拒绝
const state2 = join(root, 's2');
execFileSync(process.execPath, [join(here, 'profile-snapshot.mjs'), prof, '--take'], { encoding: 'utf8', env: { ...process.env, DSH_TURNSTILE_STATE: state2 } });
let refused = '';
try { execFileSync(process.execPath, [join(here, 'profile-snapshot.mjs'), prof, '--diff'], { encoding: 'utf8', env: { ...process.env, DSH_TURNSTILE_STATE: state2 }, stdio: 'pipe' }); }
catch (e) { refused = String(e.stderr || ''); }
ok('只有一张快照时 diff 明确报错', /只有一张快照/.test(refused), refused.trim().slice(0, 40));

console.log(fail ? 'SNAPSHOT_TEST_FAILED ' + fail : 'SNAPSHOT_TEST_OK');
process.exitCode = fail ? 1 : 0;
