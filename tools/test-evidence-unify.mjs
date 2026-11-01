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
ok('没有活宿主时用证据里的路由判 L3', /evRoute && evRoute\.path && evRoute\.status >= 200/.test(vl));
const acc = readFileSync(join(here, '..', 'tools', 'acceptance-mini.mjs'), 'utf8');
ok('验收器自动做 before/after 采集', /host-observe\.mjs', \['before'/.test(acc) && /host-observe\.mjs', \['after'/.test(acc));
ok('验收器会用宿主证据复判一次', /--host-evidence/.test(acc) && /verify-with-host-evidence/.test(acc));
ok('验收器复判时带 --expect（否则 L4 永远 unknown）', /--host-evidence', evFile, '--expect'/.test(acc));
const col = readFileSync(join(here, '..', 'tools', 'lib', 'host-collector.mjs'), 'utf8');
const adp = readFileSync(join(here, '..', 'tools', 'lib', 'mini-host-adapter.mjs'), 'utf8');
ok('采集器抓正文摘录（L4 判据）', /bodyExcerpt/.test(col) && /bodyExcerpt/.test(adp));
ok('摘录截断，不把整页塞进证据', /slice\(0, 800\)/.test(adp));
ok('L4 可用摘录判定', /host-evidence 正文摘录含/.test(vl));
ok('trial-status 输出 claim 字段', /claim,/.test(ts));
ok('trial-status 的 claim 只用阶梯词', ['static-only', 'verified-with-regression', 'failed', 'unknown'].every((w) => ts.includes("'" + w + "'")));
ok('两边没有第二套成功词（loaded/pass/ok 之外的）', !/claim\s*=\s*'pass'/.test(ts) && !/claim\s*=\s*'loaded'/.test(ts));

// 阶梯本身：同一组层必须给出同一个 claim
const P = (id) => layer(id, STATUS.pass, ['ok']);
ok('L0..L2 → loaded', claimOf([P('L0'), P('L1'), P('L2')]).code === 'loaded');
ok('L0..L5 → verified-with-regression', claimOf(['L0','L1','L2','L3','L4','L5'].map(P)).code === 'verified-with-regression');

console.log(fail ? 'EVIDENCE_UNIFY_FAILED ' + fail : 'EVIDENCE_UNIFY_OK');
process.exitCode = fail ? 1 : 0;