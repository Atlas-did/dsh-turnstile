#!/usr/bin/env node
// 关联最近一次 trial 与真实宿主证据；static-pass 或孤立 HTTP 200 都不能变成加载成功。
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateHostEvidence } from './lib/host-evidence.mjs';

const args = process.argv.slice(2);
const profile = args.find((a) => !a.startsWith('--'));
if (!profile) {
  console.error('usage: node tools/trial-status.mjs <profileDir> [--json]');
  process.exit(2);
}
const state = process.env.DSH_TURNSTILE_STATE || join(resolve(profile), '..', '..', 'turnstile-state');
const file = join(state, 'lab-journal.jsonl');
let latest = null;
const hostRows = [];
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.kind === 'trial') latest = entry;
      if (entry.kind === 'host-evidence') hostRows.push(entry);
    } catch { /* 损坏行不是一次有效试装证据 */ }
  }
}
const hostLatest = latest ? hostRows.filter((r) => r.target === latest.target).at(-1) : null;
const hostCheck = hostLatest
  ? validateHostEvidence(hostLatest.evidence, { target: latest.target, profile, trialAt: latest.at })
  : { ok: false, errors: [] };
const failed = latest && (latest.verdict === 'fail' || latest.verdict === 'blocked');
const loaded = Boolean(latest && !failed && hostCheck.ok);
const verdict = !latest ? 'unknown' : failed ? 'fail' : loaded ? 'ok' : 'warn';
const summary = !latest ? '还没有试装记录'
  : failed ? '最近一次试装未通过：' + (latest.note || latest.verdict)
  : loaded ? `真实宿主重启与目标路由证据通过：${latest.target} ${hostLatest.evidence.route.path}=200`
  : hostLatest && !hostCheck.ok ? '宿主证据未通过关联校验：' + hostCheck.errors.join('；')
  : latest.verdict === 'static-pass' ? '最近一次试装仅静态通过；真实宿主插件加载未验证'
  : '最近一次试装记录为 ' + latest.verdict + '；请核对是否包含真实宿主加载证据';
const evidence = latest ? [{ source: file, at: latest.at, verdict: latest.verdict, note: latest.note }] : [];
if (hostLatest) evidence.push({ source: file, at: hostLatest.at, verdict: hostLatest.verdict, valid: hostCheck.ok, errors: hostCheck.errors });
const report = {
  ok: loaded,
  verdict,
  summary,
  latest,
  hostEvidence: hostLatest ? { at: hostLatest.at, valid: hostCheck.ok, errors: hostCheck.errors, route: hostLatest.evidence?.route || null } : null,
  evidence,
  findings: [],
  next: loaded
    ? [{ label: '查看整体状态', command: 'node tools/turnstile.mjs doctor <profile> --json', mutating: false, reason: '真实宿主加载证据已通过关联校验' }]
    : [
      { label: '补真实宿主加载证据', command: 'node tools/turnstile.mjs trial <profile> <pluginDir> --keep', mutating: true, reason: '保留安装后重启真实宿主，再检查目标路由；完成前不要声称试装成功' },
      { label: '记录适配器采集的宿主证据', command: 'node tools/host-evidence.mjs <evidence.json> --record --state <state>', mutating: true, reason: '先校验证据；只有同插件、同 profile 且晚于本次试装的新启动与路由证据才会关联' },
    ],
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = !latest ? 3 : failed ? 1 : loaded ? 0 : 2;
