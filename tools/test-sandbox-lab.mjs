// A 类：实验场闭环的四件工具（快照 / 记录 / trial / promote）。
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (script, args, env = {}) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(root, 'tools', script), ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 }) }; }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};
const profile = (dir, extra = {}) => {
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, ...extra }, null, 2));
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n');
  return dir;
};

// --- 快照 ---
const s1 = mkdtempSync(join(tmpdir(), 'lab-'));
const p1 = profile(join(s1, 'profiles', 'mini'));
const st1 = { DSH_TURNSTILE_STATE: join(s1, 'state') };
ok('快照可拍', run('sandbox-snapshot.mjs', [p1, '--take', '--label', 'test', '--state', st1.DSH_TURNSTILE_STATE], st1).code === 0);
writeFileSync(join(p1, 'cordis.patch.yml'), '- id: oops\n');
const restore = run('sandbox-snapshot.mjs', [p1, '--restore', 'latest', '--state', st1.DSH_TURNSTILE_STATE], st1);
ok('回滚把文件恢复原样', readFileSync(join(p1, 'cordis.patch.yml'), 'utf8').trim() === '[]', restore.out.trim().slice(0, 60));
ok('回滚前留了 .before-restore', readdirSync(p1).some((f) => f.includes('.before-restore-')));

// --- 记录 ---
run('lab-journal.mjs', ['--add', '--kind', 'trial', '--target', 'dsh-x', '--verdict', 'pass', '--note', 'ok'], st1);
const jl = run('lab-journal.mjs', ['--list'], st1).out;
ok('记录可写可读', /dsh-x/.test(jl) && /pass/.test(jl), jl.trim().slice(0, 60));
const exp = join(s1, 'issue.md');
run('lab-journal.mjs', ['--export', exp], st1);
ok('记录可导出 markdown', existsSync(exp) && /dsh-x/.test(readFileSync(exp, 'utf8')));

// --- trial ---
const s2 = mkdtempSync(join(tmpdir(), 'lab2-'));
const p2 = profile(join(s2, 'profiles', 'mini'));
const plug = join(s2, 'plugins', 'hello');
mkdirSync(plug, { recursive: true });
writeFileSync(join(plug, 'package.json'), JSON.stringify({ name: 'hello-trial', version: '0.0.1' }));
writeFileSync(join(plug, 'index.js'), 'export const ok = true;\n');
const st2 = { DSH_TURNSTILE_STATE: join(s2, 'state') };
const badState = join(s2, 'state-is-a-file');
writeFileSync(badState, 'not a directory');
const noSnapshot = run('sandbox-trial.mjs', [p2, plug, '--state', badState], st2);
ok('快照失败时停止且不安装', noSnapshot.code !== 0 && /未安装/.test(noSnapshot.out) && !existsSync(join(p2, 'node_modules', 'hello-trial')), noSnapshot.out.split('\n').slice(-2).join(' '));
const trial = run('sandbox-trial.mjs', [p2, plug], st2);
ok('trial 只声明静态通过，不冒称插件已加载', /结论：静态通过/.test(trial.out) && /插件加载未验证/.test(trial.out) && !/结论：通过/.test(trial.out), trial.out.split('\n').slice(-2).join(' '));
ok('trial 默认回滚：依赖被还原', !JSON.parse(readFileSync(join(p2, 'package.json'), 'utf8')).dependencies['hello-trial']);
ok('trial 默认回滚：node_modules 清掉', !existsSync(join(p2, 'node_modules', 'hello-trial')));
// 服务必须在另一个进程：execFileSync 会阻塞测试进程，自己的服务器无法回应。
const healthProcess = spawn(process.execPath, ['-e', 'require("node:http").createServer((q,s)=>{s.writeHead(200);s.end("{}")}).listen(0,"127.0.0.1",function(){console.log(this.address().port)})'], { stdio: ['ignore', 'pipe', 'pipe'] });
const healthPort = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('health fixture timeout')), 5000);
  healthProcess.stdout.once('data', (data) => { clearTimeout(timer); resolve(String(data).trim()); });
});
const healthTrial = run('sandbox-trial.mjs', [p2, plug, '--port', healthPort], st2);
healthProcess.kill();
ok('宿主健康与插件加载分开报告', /http-health/.test(healthTrial.out) && /SKIP plugin-load/.test(healthTrial.out) && /静态通过/.test(healthTrial.out), healthTrial.out.split('\n').slice(-3).join(' '));
const lastJournal = run('lab-journal.mjs', ['--list', '--last', '1'], st2).out;
ok('实验记录使用 static-pass 并标记加载未验证', /static-pass/.test(lastJournal) && /plugin-load=unverified/.test(lastJournal), lastJournal.trim());
const kept = run('sandbox-trial.mjs', [p2, plug, '--keep'], st2);
ok('--keep 时保留安装', JSON.parse(readFileSync(join(p2, 'package.json'), 'utf8')).dependencies['hello-trial'] !== undefined, kept.out.split('\n').slice(-1)[0]);
ok('安全复制保留插件文件', existsSync(join(p2, 'node_modules', 'hello-trial', 'index.js')));

// --- promote ---
const s3 = mkdtempSync(join(tmpdir(), 'lab3-'));
const sand = profile(join(s3, 'sand'));
const main = profile(join(s3, 'main'));
const sp = JSON.parse(readFileSync(join(sand, 'package.json'), 'utf8'));
sp.dependencies['dsh-x'] = '1.0.0';
sp.dsh.profile.bundles.push('dsh-x');
writeFileSync(join(sand, 'package.json'), JSON.stringify(sp, null, 2));
writeFileSync(join(sand, 'cordis.patch.yml'), '- id: dsh-x\n');
const dry = run('sandbox-promote.mjs', [sand, main]);
ok('promote 默认 dry-run 且列出三处', /dry-run/.test(dry.out) && /bundles/.test(dry.out) && /dependencies/.test(dry.out) && /patch/.test(dry.out));
ok('dry-run 不写主 profile', JSON.parse(readFileSync(join(main, 'package.json'), 'utf8')).dsh.profile.bundles.length === 1);
const applied = run('sandbox-promote.mjs', [sand, main, '--apply']);
const mp = JSON.parse(readFileSync(join(main, 'package.json'), 'utf8'));
ok('--apply 写入 bundles 与依赖', mp.dsh.profile.bundles.includes('dsh-x') && !!mp.dependencies['dsh-x'], applied.out.trim().slice(0, 60));
ok('--apply 后 patch 仍可解析', run('profile-yaml.mjs', [main]).code === 0);

console.log(fail ? 'SANDBOXLAB_TEST_FAILED ' + fail : 'SANDBOXLAB_TEST_OK');
process.exitCode = fail ? 1 : 0;
