#!/usr/bin/env node
// 校验并可选记录由真实宿主适配器采集的证据；本工具不会把隔离结果升格为真实结果。
// usage: node tools/host-evidence.mjs <evidence.json> [--record] [--state <dir>] [--json]
import { readFileSync, statSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateHostEvidence } from './lib/host-evidence.mjs';

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const asJson = argv.includes('--json');
if (!input) {
  console.error('usage: node tools/host-evidence.mjs <evidence.json> [--record] [--state <dir>] [--json]');
  process.exit(2);
}

let raw = null;
let validation = null;
try {
  if (statSync(input).size > 1024 * 1024) throw new Error('证据文件超过 1 MB');
  raw = JSON.parse(readFileSync(input, 'utf8'));
  validation = validateHostEvidence(raw, { target: raw.target, profile: raw.profile });
} catch (e) {
  validation = { ok: false, errors: [String(e?.message || e)] };
}

const report = {
  ok: validation.ok,
  verdict: validation.ok ? 'ok' : 'fail',
  summary: validation.ok ? '真实宿主证据结构完整；可关联到对应试装' : '宿主证据无效：' + validation.errors.join('；'),
  errors: validation.errors,
  evidence: raw && validation.ok ? [{ schema: raw.schema, target: raw.target, capturedAt: raw.capturedAt, route: raw.route }] : [],
  recorded: false,
};

if (validation.ok && argv.includes('--record')) {
  const state = val('--state') || process.env.DSH_TURNSTILE_STATE || join(resolve(raw.profile), '..', '..', 'turnstile-state');
  mkdirSync(state, { recursive: true });
  const file = join(state, 'lab-journal.jsonl');
  const entry = {
    at: new Date().toISOString(),
    kind: 'host-evidence',
    target: raw.target,
    verdict: 'host-pass',
    note: `boot=${raw.host.bootId} route=${raw.route.path} status=${raw.route.status}`,
    evidence: raw,
  };
  appendFileSync(file, JSON.stringify(entry) + '\n');
  report.recorded = true;
  report.evidence.push({ source: file, at: entry.at });
  report.summary = '真实宿主证据已记录；trial-status 会校验它与最近一次试装的关联';
}

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.summary);
  if (report.recorded) console.log('已写入实验记录；可用 trial-status 查看关联结论。');
}
process.exitCode = validation.ok ? 0 : 1;
