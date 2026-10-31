#!/usr/bin/env node
// 注册表变更监听（轮询 reg query，零依赖）。
// usage: node tools/watch-registry.mjs [--key HKCU\Environment] [--interval 800] [--duration 10] [--once] [--json]
import { execFileSync } from 'node:child_process';
import { parseRegQuery, diffSnapshots } from '../plugins/turnstile-popup/lib/reg-diff.js';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const key = val('--key') || 'HKCU\\Environment';
const interval = Number(val('--interval') || 800);
const duration = Number(val('--duration') || 0);

function readKey(k) {
  try {
    const out = execFileSync('reg', ['query', k], { encoding: 'utf8', timeout: 20000 });
    return parseRegQuery(out);
  } catch (e) { return null; }
}

const first = readKey(key);
if (first === null) { console.error('读不到注册表键：' + key); process.exit(3); }
if (has('--once')) {
  console.log(JSON.stringify({ key, count: Object.keys(first).length, values: first }, null, 1));
  process.exit(0);
}

let prev = first;
let emitted = 0;
const tick = () => {
  const now = readKey(key);
  if (now === null) return;
  const at = new Date().toISOString();
  for (const c of diffSnapshots(prev, now)) {
    emitted += 1;
    process.stdout.write(JSON.stringify(Object.assign({ at, key }, c)) + '\n');
  }
  prev = now;
};

process.stderr.write('监听注册表 ' + key + '（每 ' + interval + 'ms' + (duration ? '，' + duration + 's 后停' : '') + '）\n');
const timer = setInterval(tick, interval);
if (duration > 0) setTimeout(() => { clearInterval(timer); process.stderr.write('结束，共 ' + emitted + ' 个事件\n'); process.exit(0); }, duration * 1000);
