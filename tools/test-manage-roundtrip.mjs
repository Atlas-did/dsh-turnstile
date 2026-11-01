// P0-1 回归：disable → enable 必须保住用户的 config（先红后绿）。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'manage.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
function makeProfile() {
  const tmp = mkdtempSync(join(tmpdir(), 'mg-'));
  const profile = join(tmp, 'profile');
  mkdirSync(join(profile, 'node_modules', 'plug-a'), { recursive: true });
  writeFileSync(join(profile, 'node_modules', 'plug-a', 'package.json'), JSON.stringify({ name: 'plug-a', version: '1.0.0', main: 'index.js', dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  writeFileSync(join(profile, 'node_modules', 'plug-a', 'cordis.patch.yml'), '- id: plug-a\n  name: plug-a\n');
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1', dependencies: { 'plug-a': 'file:x' }, dsh: { profile: { bundles: ['plug-a'] } } }));
  return { tmp, profile, patch: join(profile, 'cordis.patch.yml') };
}
function run(profile, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tool, profile, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

// 1) 带 config 的行：disable 不能丢 config，enable 要能字节级还原
let f = makeProfile();
const original = ['- id: plug-a', '  name: plug-a', '  config:', '    anchor: bottom-right', '    order: 3', ''].join('\n');
writeFileSync(f.patch, original);
let r = await run(f.profile, ['--disable', 'plug-a', '--yes']);
const afterDisable = readFileSync(f.patch, 'utf8');
ok('disable 成功', r.code === 0, String(r.code));
ok('disable 保留用户 config', afterDisable.includes('anchor: bottom-right') && afterDisable.includes('order: 3'), afterDisable.slice(0, 120));
ok('disable 加了 disabled: true', /disabled:\s*true/.test(afterDisable));
ok('disable 没有新增第二个 id 块', (afterDisable.match(/^-\s*id:\s*plug-a\s*$/gm) || []).length === 1);
r = await run(f.profile, ['--enable', 'plug-a', '--yes']);
const afterEnable = readFileSync(f.patch, 'utf8');
ok('enable 成功', r.code === 0, String(r.code));
ok('enable 字节级还原', afterEnable === original, JSON.stringify(afterEnable));
rmSync(f.tmp, { recursive: true, force: true });

// 2) 重复 disable 幂等
f = makeProfile();
writeFileSync(f.patch, '- id: plug-a\n  name: plug-a\n');
await run(f.profile, ['--disable', 'plug-a', '--yes']);
await run(f.profile, ['--disable', 'plug-a', '--yes']);
const twice = readFileSync(f.patch, 'utf8');
ok('重复 disable 不产生第二个块', (twice.match(/^-\s*id:\s*plug-a\s*$/gm) || []).length === 1, JSON.stringify(twice));
ok('重复 disable 也只有一行 disabled', (twice.match(/^\s*disabled:\s*true\s*$/gm) || []).length === 1);
rmSync(f.tmp, { recursive: true, force: true });

// 3) 空 patch（[]）也能启用
f = makeProfile();
writeFileSync(f.patch, '[]\n');
r = await run(f.profile, ['--disable', 'plug-a', '--yes']);
ok('空 [] 也能 disable 且不再是 []', r.code === 0 && !/^\[\]\s*$/m.test(readFileSync(f.patch, 'utf8')), readFileSync(f.patch, 'utf8').slice(0, 80));
rmSync(f.tmp, { recursive: true, force: true });

console.log(fail ? 'MANAGE_ROUNDTRIP_FAILED ' + fail : 'MANAGE_ROUNDTRIP_OK');
process.exitCode = fail ? 1 : 0;