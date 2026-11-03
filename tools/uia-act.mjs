#!/usr/bin/env node
// uia.act：真正去操作别的窗口（focus / invoke / toggle / set-value）。
//
// 与只读版（tools/uia.mjs）的区别：
//   1. 必须带能力上下文（--profile + --plugin），由 lib/windows-gate.js 判定；
//   2. 没声明 act 的一律拒（默认拒绝，不是默认允许）；
//   3. 每次有超时，Ctrl-C 会杀掉常驻进程（可中断）。
//
// usage:
//   node tools/uia-act.mjs --profile <dir> --plugin <pkg> focus --name "窗口标题"
//   node tools/uia-act.mjs --profile <dir> --plugin <pkg> invoke --name "按钮名" [--timeout 5000]
//   node tools/uia-act.mjs --profile <dir> --plugin <pkg> set-value --name "输入框" --value "hi"
import { resolveStateDir } from './lib/state-root.mjs';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startUia } from './uia-client.mjs';
import { declared, decide, auditLine } from '../plugins/turnstile-popup/lib/windows-gate.js';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const action = argv.find((a) => !a.startsWith('--') && !['focus', 'invoke', 'toggle', 'set-value'].includes(a) === false) || '';
const verb = ['focus', 'invoke', 'toggle', 'set-value'].find((v) => argv.includes(v));
const profile = val('--profile');
const plugin = val('--plugin');
const name = val('--name');
const value = val('--value');
const timeout = Number(val('--timeout') || 8000);

if (!verb || !name) {
  console.error('usage: node tools/uia-act.mjs --profile <dir> --plugin <pkg> <focus|invoke|toggle|set-value> --name "..." [--value x] [--timeout ms]');
  process.exit(2);
}
if (!profile || !plugin) {
  console.error('拒绝：操作别的窗口必须带 --profile 与 --plugin（能力网关要看声明）');
  process.exit(4);
}
const pluginDir = join(profile, 'node_modules', plugin);
if (!existsSync(join(pluginDir, 'package.json'))) { console.error('插件没装：' + plugin); process.exit(2); }

const caps = declared(JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')));
const verdict = decide(caps, 'uia.act');
const stateDir = resolveStateDir({ profileDir: profile });
const auditFile = join(stateDir, 'windows-audit.jsonl');
const record = (ok, reason) => {
  try { mkdirSync(stateDir, { recursive: true }); appendFileSync(auditFile, auditLine({ plugin, action: 'uia.act:' + verb, verdict: ok ? 'allow' : 'deny', reason })); } catch {}
};

if (!verdict.allow) {
  record(false, verdict.reason);
  console.error('DENY  ' + verdict.reason);
  process.exit(3);
}

record(true, verdict.reason + ' · ' + verb + ' ' + name);
const client = await startUia();
const stop = async (code) => { await client.close(); process.exit(code); };
process.on('SIGINT', () => { console.error('中断：关闭 UIA 进程'); client.close().then(() => process.exit(130)); });

const payload = verb === 'set-value'
  ? { action: 'setvalue', name, value: value == null ? '' : value }
  : { action: verb, name };

try {
  const t0 = Date.now();
  const res = await client.request(payload, { timeoutMs: timeout });
  const ms = Date.now() - t0;
  if (!res.ok) { console.error('失败：' + res.error); await stop(1); }
  console.log((verb + ' 成功 · ' + ms + 'ms').padEnd(22) + JSON.stringify(res.data).slice(0, 180));
  await stop(0);
} catch (e) {
  console.error('失败：' + e.message);
  await stop(1);
}
