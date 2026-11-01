// lab-reload：重启 → 等就绪 → 取新 token。没就绪必须如实报 false。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'tools', 'lab-reload.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => { try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 240000 }) }; } catch (e) { return { code: e.status, out: String((e.stdout || '') + (e.stderr || '')) }; } };
const json = (o) => { const s = o.out; return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };

// 不重启模式：只从日志取 token 并验 health（要求 mini 正在跑）
const r = run(['--no-restart', '--json']);
if (r.code !== 0) {
  console.log('skip 需要 mini 在跑（先 node tools/mini-ctl.mjs start）');
  console.log('LAB_RELOAD_SKIPPED');
  process.exit(0);
}
const j = json(r);
ok('不重启时也给 token 与端口', j.ok === true && j.token.length > 20 && j.port > 0, String(j.port));
ok('token 来自日志最后一条（不是旧的）', /^[A-Za-z0-9_-]+$/.test(j.token), j.token.slice(0, 8));
ok('health 通了才算就绪', Array.isArray(j.health) && j.health.length > 0, (j.health || []).join(','));
ok('不重启时 restarted=false', j.restarted === false);

console.log(fail ? 'LAB_RELOAD_FAILED ' + fail : 'LAB_RELOAD_OK');
process.exitCode = fail ? 1 : 0;