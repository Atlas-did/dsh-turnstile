// next[] 契约（评审黄 4 / 讲解 #8）：不留未替换的 <profile>，不重复同一条命令，占位符要标出来。
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [join(here, 'turnstile.mjs'), ...args], { encoding: 'utf8' });
  const s = r.stdout || '';
  try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return null; }
};
const fixture = join(here, '..', 'tests', 'console-fixture');
for (const cmd of ['doctor', 'gate']) {
  const j = run(cmd, fixture, '--json');
  const next = (j && j.next) || [];
  ok(cmd + ' 的 next 里没有未替换的 <profile>', next.every((n) => !String(n.command).includes('<profile>')), JSON.stringify(next.map((n) => n.command)));
  const keys = next.map((n) => String(n.command).replace(/\s--json\b/, '').trim());
  ok(cmd + ' 的 next 不重复（忽略 --json）', new Set(keys).size === keys.length, JSON.stringify(keys));
  ok(cmd + ' 的每条 next 都带 needsSubstitution 标记', next.every((n) => typeof n.needsSubstitution === 'boolean'));
}
console.log(fail ? 'NEXT_CONTRACT_FAILED ' + fail : 'NEXT_CONTRACT_OK');
process.exitCode = fail ? 1 : 0;
