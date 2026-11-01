// verify-live 的诚实性：没连活宿主就必须 unknown，不能默认 pass。
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'tools', 'verify-live.mjs');
const fixture = join(here, '..', 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 120000 }) }; }
  catch (e) { return { code: e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};
const json = (o) => { const s = o.out; return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };

// 1) 只给 profile：L2 起必须 unknown（没有证据就不许说通过）
const bare = json(run([fixture, '--pkg', 'plug-alpha', '--json']));
ok('没有 dump-config → L2 unknown', bare.levels.find((l) => l.level === 'L2').status === 'unknown');
ok('没有活宿主 → L3 unknown', bare.levels.find((l) => l.level === 'L3').status === 'unknown');
ok('结论不能说可用', !/可用$|可用了/.test(bare.claimText) && bare.deepest !== 'L5', bare.claimText.slice(0, 26));

// 2) 插件不在 bundles 里 → L0 fail，退出码非 0
const missing = run([fixture, '--pkg', 'not-installed-x', '--json']);
const mj = json(missing);
ok('不在 bundles 的包 L0 失败', mj.levels.find((l) => l.level === 'L0').status === 'fail');
ok('L0 失败时退出码 1', missing.code === 1, String(missing.code));

// 3) 连着活宿主但路由错 → L3 失败，且结论点名路由层
const live = process.env.TK && process.env.BASE ? json(run([fixture, '--pkg', 'plug-alpha', '--base', process.env.BASE, '--token', process.env.TK, '--routes', '/definitely-not-here', '--json'])) : null;
if (live) {
  const l3 = live.levels.find((l) => l.level === 'L3');
  ok('连了活宿主后 L3 有结论（pass/fail，不再 unknown）', l3.status !== 'unknown', l3.status);
  ok('失败结论点名「哪一层」并给原因', /失败/.test(live.claimText) && /（/.test(live.claimText), live.claimText.slice(0, 40));
  ok('结论永远不出现「可用」这种结论词', !/认为可用[。]?$/.test(live.claimText.replace('不能认为可用', '')));
} else console.log('skip 活宿主用例（没设 TK/BASE）');

console.log(fail ? 'VERIFY_LIVE_FAILED ' + fail : 'VERIFY_LIVE_OK');
process.exitCode = fail ? 1 : 0;
