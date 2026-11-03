#!/usr/bin/env node
// 逐条跑完所有套件并汇总失败（评审红 2）。
// 以前的 test:all 是 86 个 && 串联：第一条红，后面全不跑，失败清单还要翻日志。
import { spawnSync } from 'node:child_process';
import { SUITES } from './test-suites.mjs';

const only = process.argv.slice(2);
const filter = only.length ? (cmd) => only.some((k) => cmd.includes(k)) : () => true;
const list = SUITES.filter(filter);
let failed = 0;
const results = [];
const started = Date.now();

for (const cmd of list) {
  const t = Date.now();
  // 用启动 runner 的那个 Node 跑，而不是 PATH 里的 node：engines 声明要求 22.19+/24+
  const execCmd = cmd.replace(/^node\s+/, JSON.stringify(process.execPath) + ' ');
  const r = spawnSync(execCmd, { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000 });
  const ok = r.status === 0;
  if (!ok) failed += 1;
  const tail = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 200);
  results.push({ cmd, ok, ms: Date.now() - t, tail });
  process.stdout.write((ok ? 'ok   ' : 'FAIL ') + cmd.replace(/^node /, '') + '  (' + ((Date.now() - t) / 1000).toFixed(1) + 's)\n');
}

const bad = results.filter((r) => !r.ok);
console.log('');
console.log('套件 ' + results.length + ' 个 · 通过 ' + (results.length - bad.length) + ' · 失败 ' + bad.length + ' · 用时 ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
if (bad.length) {
  console.log('');
  console.log('失败清单（按执行顺序）：');
  for (const b of bad) console.log('  ✗ ' + b.cmd + '\n      ' + b.tail);
}
process.exitCode = bad.length;
