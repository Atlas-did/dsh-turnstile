#!/usr/bin/env node
// diagnose：把「现在坏在哪、下一步做什么」变成一条命令。
//
// 与旧工具的区别：旧的全是静态查 profile；这个读**日志+网络+版本**，并且：
//   - 可达(reachable) 与 可用(usable) 分两栏，永不合布尔；
//   - 每条结论带证据(file+sha256 前缀+行)与推翻条件(falsifier)；
//   - 证据不足时输出 undetermined 并写 missing，不猜。
//
// usage: node tools/diagnose.mjs [--corpus <dir>] [--live] [--as-of <iso>] [--probe] [--json]
// exit:  0 全健康 | 1 有 failing | 2 用法错 | 4 语料漂移
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { readRecords, readManifest } from './lib/records.mjs';
import { aggregate, classify, isFailure } from './lib/classify.mjs';
import { probeLayers } from './lib/probe.mjs';
import { actionsFor, missingFor } from './lib/actions.mjs';
import { checkNoProxy } from './lib/proxy.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const corpusArg = flag('--corpus');
const live = has('--live');
const asOf = flag('--as-of');
const wantProbe = has('--probe');

if (!corpusArg && !live) {
  console.error('用法: node tools/diagnose.mjs --corpus <dir> | --live [--as-of <iso>] [--probe] [--json]');
  process.exit(2);
}

function collect(dir) {
  const out = {};
  const only = flag('--only') ? String(flag('--only')).split(',') : null;
  for (const sub of ['aa', 'control', 'plugin']) {
    if (only && !only.includes(sub)) continue;
    const p = join(dir, 'logs', sub);
    if (!existsSync(p)) continue;
    out[sub] = readdirSync(p).filter((f) => f.endsWith('.jsonl')).map((f) => join(p, f));
  }
  return out;
}

let sets = null;
let manifest = null;
if (corpusArg) {
  const dir = existsSync(corpusArg) ? corpusArg : join(repoRoot, corpusArg);
  if (!existsSync(dir)) { console.error('corpus 不存在: ' + corpusArg); process.exit(2); }
  manifest = readManifest(dir);
  sets = collect(dir);
} else {
  const aaLogs = join(homedir(), '.agents-anywhere', 'logs');
  const pluginLogs = join(homedir(), '.agents-anywhere', 'dsh-bridge-next', 'logs');
  sets = {};
  if (existsSync(aaLogs)) sets.aa = readdirSync(aaLogs).filter((f) => f.endsWith('.jsonl')).map((f) => join(aaLogs, f));
  if (existsSync(pluginLogs)) sets.plugin = readdirSync(pluginLogs).filter((f) => f.endsWith('.jsonl')).map((f) => join(pluginLogs, f));
}

const loaded = {};
for (const [k, paths] of Object.entries(sets || {})) {
  loaded[k] = readRecords(paths, { manifest });
}

const drift = Object.values(loaded).flatMap((s) => s.drift);
const allRecords = Object.values(loaded).flatMap((s) => s.records);
const mode = asOf ? 'as-of' : 'all';
const channels = aggregate(allRecords, { mode, asOf });

// 证据：每个通道给前 3 条失败记录
for (const ch of channels) {
  ch.evidence = allRecords
    .filter((r) => { const c = classify(r); return c.channel === ch.id && isFailure(c.signal); })
    .slice(0, 3)
    .map((r) => ({ file: r.file, sha256Prefix: r.sha256.slice(0, 16), line: r.line, text: (r.message || '').slice(0, 90) }));
  ch.falsifier = falsifierFor(ch.id);
}

function falsifierFor(id) {
  if (id === 'codex') return '出现 codex 的 sync completed 且无 unknown variant 记录';
  if (id === 'dsh') return '同一时间窗内出现 sync.ack 且无 sync.failed';
  if (id === 'ingest') return '出现一次真实 ingest 成功（日志里有响应状态码或 ack）';
  if (id === 'plugin-bridge') return '新版插件启动后不再出现 PARSE_ERROR';
  return '与该通道相反的真实成功记录';
}

// 网络：只有显式 --probe 才做（默认不联网）
let probes = null;
if (wantProbe) {
  const ca = join(homedir(), '.dsh', 'certs', 'dev-sidecar-root.pem');
  const urls = ['https://web.agents-anywhere.com/', 'https://api.deepseek.com/', 'https://github.com/'];
  probes = [];
  for (const u of urls) probes.push(await probeLayers(u, { caFile: ca }));
}

// 结论 + 修法（共用 tools/lib/actions.mjs，避免 CLI 与面板各写一份）
const actions = actionsFor(channels);
const missing = missingFor(channels);

// NO_PROXY：只在 live 模式查（corpus 回放与当前环境无关）
let noProxy = null;
if (live) {
  const host = 'web.agents-anywhere.com';
  let userValue = '';
  try {
    const { execFileSync } = await import('node:child_process');
    userValue = execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('NO_PROXY','User')"], { encoding: 'utf8' }).trim();
  } catch {}
  noProxy = checkNoProxy({ host, userValue, processValue: process.env.NO_PROXY || process.env.no_proxy || '' });
}

const result = {
  mode, asOf: asOf || null,
  corpus: corpusArg || null,
  files: Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, { files: v.files.length, records: v.records.length, duplicates: v.duplicates }])),
  drift,
  channels,
  probes,
  actions,
  missing,
  noProxy,
  verdict: drift.length ? 'corpus-drift'
    : channels.some((c) => c.verdict === 'failing') ? 'failing'
    : channels.some((c) => c.verdict === 'undetermined') ? 'undetermined'
    : channels.length ? 'healthy' : 'undetermined',
};

if (has('--json')) {
  console.log(JSON.stringify(result, null, 1));
} else {
  console.log('diagnose · ' + (corpusArg || 'live') + ' · mode=' + mode);
  for (const [k, v] of Object.entries(result.files)) console.log('  ' + k.padEnd(8) + v.files + ' 文件 / ' + v.records + ' 条' + (v.duplicates ? '（重复 ' + v.duplicates + '）' : ''));
  if (drift.length) console.log('  ⚠ 语料漂移: ' + JSON.stringify(drift));
  console.log('');
  for (const ch of channels) {
    const mark = ch.verdict === 'failing' ? '✗' : ch.verdict === 'healthy' ? '✓' : '?';
    console.log(mark + ' ' + ch.id.padEnd(14) + ch.verdict.padEnd(14) + 'failures=' + ch.counts.failures + ' ' + JSON.stringify(ch.counts.signals));
    if (ch.evidence.length) console.log('    证据 ' + ch.evidence[0].file + ':' + ch.evidence[0].line + '  ' + ch.evidence[0].text);
    console.log('    推翻条件 ' + ch.falsifier);
  }
  if (probes) {
    console.log('');
    for (const p of probes) console.log('  probe ' + p.url + '  ' + JSON.stringify(p.layers) + (p.error ? '  ' + p.error : ''));
  }
  if (noProxy) console.log('\nNO_PROXY  ' + noProxy.level + '  ' + noProxy.message + (noProxy.next ? '\n         → ' + noProxy.next : ''));
  if (actions.length) {
    console.log('');
    console.log('修法:');
    for (const a of actions) console.log('  · ' + a.text + '\n    回滚: ' + a.rollback);
  }
  console.log('');
  console.log('结论: ' + result.verdict);
}

process.exitCode = drift.length ? 4 : result.verdict === 'failing' ? 1 : 0;