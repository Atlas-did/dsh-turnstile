#!/usr/bin/env node
// 两阶段采集真实 mini 证据；本工具只观察，不启动/停止宿主。
// before: node tools/host-observe.mjs before <profile> <pkg> --mini <dir> --out <observation.json>
// after:  node tools/host-observe.mjs after <profile> <pkg> --mini <dir> --input <observation.json> --out <evidence.json> [--route /pkg]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { beginHostObservation, finishHostObservation } from './lib/host-collector.mjs';
import { createMiniHostAdapter } from './lib/mini-host-adapter.mjs';

const argv = process.argv.slice(2);
const phase = argv[0];
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && ['--mini', '--out', '--input', '--route'].includes(all[i - 1])));
const [profile, target] = positional;
const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
if (!['before', 'after'].includes(phase) || !profile || !target || !val('--mini') || !val('--out') || (phase === 'after' && !val('--input'))) {
  console.error('usage: node tools/host-observe.mjs before|after <profile> <pkg> --mini <dir> --out <file> [--input <observation.json>] [--route /pkg]');
  process.exit(2);
}

const adapter = createMiniHostAdapter({ mini: val('--mini') });
try {
  if (phase === 'before') {
    const session = await beginHostObservation({ profile, target }, adapter);
    mkdirSync(dirname(resolve(val('--out'))), { recursive: true });
    writeFileSync(val('--out'), JSON.stringify(session, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, verdict: 'ok', summary: '已记录重启前宿主；完成受控重启后再运行 after', observation: val('--out'), next: ['重启该 mini', `host-observe after ${profile} ${target} --input ${val('--out')}`] }, null, 2));
  } else {
    const session = JSON.parse(readFileSync(val('--input'), 'utf8'));
    if (session.target !== target || session.profile !== resolve(profile)) throw new Error('after 的插件或 profile 与 before 不一致');
    const result = await finishHostObservation(session, { route: val('--route') }, adapter);
    if (result.ok) {
      mkdirSync(dirname(resolve(val('--out'))), { recursive: true });
      writeFileSync(val('--out'), JSON.stringify(result.evidence, null, 2) + '\n');
    }
    console.log(JSON.stringify({ ok: result.ok, verdict: result.ok ? 'ok' : 'fail', summary: result.ok ? '真实宿主证据已生成；下一步校验并记录' : '宿主证据不完整：' + result.errors.join('；'), errors: result.errors, evidence: result.ok ? val('--out') : null }, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, verdict: 'fail', summary: String(e?.message || e), errors: [String(e?.message || e)] }, null, 2));
  process.exitCode = 1;
}
