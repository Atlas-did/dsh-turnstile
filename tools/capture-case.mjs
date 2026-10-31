#!/usr/bin/env node
// C3：把当前故障现场冻结成可回放样本（tests/corpus/<date>-<name>/）。
//
// 为什么：没有冻结样本，任何「修好了」都无法复核——数字会漂（2026-10-31 那次 222→229）。
//
// usage: node tools/capture-case.mjs <name> [--logs <dir>] [--plugin-logs <dir>] [--note 说明] [--corpus <dir>]
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--'));
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
if (!name) { console.error('usage: node tools/capture-case.mjs <name> [--logs <dir>] [--plugin-logs <dir>] [--note 说明]'); process.exit(2); }

const logs = val('--logs') || join(homedir(), '.agents-anywhere', 'logs');
const pluginLogs = val('--plugin-logs') || join(homedir(), '.agents-anywhere', 'dsh-bridge-next', 'logs');
const note = val('--note') || '';
const stamp = new Date().toISOString().slice(0, 10);
const corpus = val('--corpus') || join('tests', 'corpus', stamp + '-' + name);

const pick = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)) : []);
const aa = pick(logs);
const pl = pick(pluginLogs);
if (!aa.length && !pl.length) { console.error('没有找到日志：' + logs + ' / ' + pluginLogs); process.exit(3); }

const files = [];
for (const [sub, list] of [['logs/aa', aa], ['logs/plugin', pl]]) {
  const dir = join(corpus, sub);
  mkdirSync(dir, { recursive: true });
  for (const f of list) {
    const dst = join(dir, f.split(/[\\/]/).pop());
    copyFileSync(f, dst);
    const buf = readFileSync(dst);
    files.push({ path: sub + '/' + dst.split(/[\\/]/).pop(), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  }
}

writeFileSync(join(corpus, 'manifest.json'), JSON.stringify({
  frozenAt: new Date().toISOString(),
  note: note || ('case ' + name),
  source: { aa: logs, plugin: pluginLogs },
  laws: ['record = e.record || e', 'ts normalised to UTC', 'dedupe by seq', 'aa and control must not be scanned together'],
  files,
}, null, 2) + '\n');

writeFileSync(join(corpus, 'labels.md'), ['# ' + name + ' 样本', '', '> 冻结于 ' + new Date().toISOString(), '', note || '（未写说明：请补上「预期诊断结论」）', '', '## 复跑', '', '```bash', 'node tools/diagnose.mjs --corpus ' + corpus, '```', ''].join('\n'));

console.log('样本已冻结 ' + corpus);
console.log('  文件 ' + files.length + ' 个，共 ' + files.reduce((a, b) => a + b.bytes, 0) + ' 字节');
console.log('  下一步：在 labels.md 里写「预期结论」，然后 node tools/diagnose.mjs --corpus ' + corpus);
