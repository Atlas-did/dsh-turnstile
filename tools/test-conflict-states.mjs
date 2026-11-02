// 知识三态：current 可断言 / stale 只提示 / absent 用内置兜底（方案 docs/186 §4）。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'cf-'));
const profile = join(tmp, 'p');
mkdirSync(join(profile, 'node_modules', 'plug-a'), { recursive: true });
writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'p', version: '0.0.1', dependencies: { 'plug-a': 'file:x' } }));
writeFileSync(join(profile, 'node_modules', 'plug-a', 'package.json'), JSON.stringify({ name: 'plug-a', version: '1.0.0' }));
writeFileSync(join(profile, 'node_modules', 'plug-a', 'index.js'), 'export function apply(ctx) { ctx.notInLegacyList = 1; }');
const knowledge = (version, names) => { const f = join(tmp, 'k-' + version + '.json'); writeFileSync(f, JSON.stringify({ dshVersion: version, services: names.map((name) => ({ name })) })); return f; };
const run = (args, env) => new Promise((resolve) => {
  const c = spawn(process.execPath, [join(here, 'conflict.mjs'), profile, '--json', ...args], { env: Object.assign({}, process.env, env) });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => { let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch {} resolve({ code, j, out }); });
});

// current：版本相同 → 知识可断言，服务出现即高置信冲突
let r = await run([], { DSH_VERSION: '0.2.1-rc.3', DSH_TURNSTILE_KNOWLEDGE: knowledge('0.2.1-rc.3', ['notInLegacyList']) });
ok('current 状态被识别', r.j && r.j.knowledge.state === 'current', r.j && r.j.knowledge.state);
ok('current 下命中即 error（会阻断）', r.j && r.j.findings.some((f) => f.message === 'ctx-assign' && f.severity === 'error') && r.code === 6, String(r.code));

// stale：版本不同 → 只给提示，不阻断，不出高置信结论
r = await run([], { DSH_VERSION: '0.2.2-alpha.2', DSH_TURNSTILE_KNOWLEDGE: knowledge('0.2.1-rc.3', ['notInLegacyList']) });
ok('stale 状态被识别', r.j && r.j.knowledge.state === 'stale', r.j && r.j.knowledge.state);
const staleHits = (r.j && r.j.findings || []).filter((f) => f.message === 'ctx-assign-stale');
ok('stale 只给 ctx-assign-stale 提示', staleHits.length === 1, JSON.stringify(staleHits.map((f) => f.message)));
ok('stale 提示不是 error 且不阻断', staleHits[0].severity === 'warning' && r.code === 0, String(r.code));

// absent：没有知识文件 → 内置清单，且如实标 absent
r = await run([], { DSH_VERSION: '0.2.1-rc.3', DSH_TURNSTILE_KNOWLEDGE: join(tmp, 'nope.json') });
ok('absent 状态被识别', r.j && r.j.knowledge.state === 'absent', r.j && r.j.knowledge.state);
ok('absent 时未知服务不产生任何冲突', r.j && r.j.findings.length === 0 && r.code === 0, JSON.stringify(r.j && r.j.findings));

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'CONFLICT_STATES_FAILED ' + fail : 'CONFLICT_STATES_OK');
process.exitCode = fail ? 1 : 0;