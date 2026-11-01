// 证据词统一：verify-live 的 L0–L5 与 trial-status 的 claim 必须是同一套词。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimOf, layer, STATUS } from './lib/evidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const vl = readFileSync(join(here, '..', 'tools', 'verify-live.mjs'), 'utf8');
const ts = readFileSync(join(here, '..', 'tools', 'trial-status.mjs'), 'utf8');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('verify-live 接受真实宿主证据作为 L2 的判据', /--host-evidence/.test(vl) && /hostEv && hostEv\.ok/.test(vl));
ok('宿主证据无效时退回 dump 而不是直接判死', /host-evidence 无效/.test(vl));
ok('trial-status 输出 claim 字段', /claim,/.test(ts));
ok('trial-status 的 claim 只用阶梯词', ['static-only', 'verified-with-regression', 'failed', 'unknown'].every((w) => ts.includes("'" + w + "'")));
ok('两边没有第二套成功词（loaded/pass/ok 之外的）', !/claim\s*=\s*'pass'/.test(ts) && !/claim\s*=\s*'loaded'/.test(ts));

// 阶梯本身：同一组层必须给出同一个 claim
const P = (id) => layer(id, STATUS.pass, ['ok']);
ok('L0..L2 → loaded', claimOf([P('L0'), P('L1'), P('L2')]).code === 'loaded');
ok('L0..L5 → verified-with-regression', claimOf(['L0','L1','L2','L3','L4','L5'].map(P)).code === 'verified-with-regression');

console.log(fail ? 'EVIDENCE_UNIFY_FAILED ' + fail : 'EVIDENCE_UNIFY_OK');
process.exitCode = fail ? 1 : 0;