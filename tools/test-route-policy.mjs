// 路由策略表与实现的一致性（方案 §7-1A）：实现里出现的每个 pathname 必须在表里，
// 且凡是直接写文件的处理块都必须被标成 mutating 或 stateWrite —— 防止新增旁路被漏掉。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, routeFor, authPolicySummary, POLICY_ENFORCED } from './lib/routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const source = readFileSync(join(here, 'console-server.mjs'), 'utf8');
const implementedPaths = new Set([...source.matchAll(/pathname === '([^']+)'/g)].map((m) => m[1]));
// 有些路由是一组路径用 includes 判断的（静态前端脚本），也要收进来
for (const line of source.split(/\r?\n/)) {
  if (!line.includes('.includes(pathname)')) continue;
  for (const q of line.matchAll(/'([^']+)'/g)) if (/^\/(turnstile|api)\//.test(q[1])) implementedPaths.add(q[1]);
}
const implemented = [...implementedPaths].sort();
const declared = ROUTES.map((r) => r.path).sort();

ok('策略表覆盖实现里的每个路由', implemented.every((p) => declared.includes(p)), implemented.filter((p) => !declared.includes(p)).join(', '));
ok('策略表没有实现里不存在的路由', declared.every((p) => implemented.includes(p)), declared.filter((p) => !implemented.includes(p)).join(', '));
ok('两边数量一致', implemented.length === declared.length, implemented.length + ' vs ' + declared.length);

// 按 if (pathname === '...') 切块，看每个块有没有直接写文件
const chunks = new Map();
const marks = [...source.matchAll(/if \(pathname === '([^']+)'/g)];
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].index;
  const end = i + 1 < marks.length ? marks[i + 1].index : source.length;
  chunks.set(marks[i][1], source.slice(start, end));
}
const writes = /writeFileSync|copyFileSync|appendFileSync|rmSync|unlinkSync|renameSync/;
const undeclaredWrites = [];
for (const [path, body] of chunks) {
  if (!writes.test(body)) continue;
  const r = routeFor(path);
  if (!r || !(r.mutating || r.stateWrite)) undeclaredWrites.push(path);
}
ok('直接写文件的处理块都标了 mutating 或 stateWrite', undeclaredWrites.length === 0, undeclaredWrites.join(', '));

const summary = authPolicySummary();
ok('除存活探针外都需要凭据', ROUTES.filter((r) => r.kind !== 'liveness').every((r) => r.auth === 'token'), JSON.stringify(summary.byAuth));
ok('存活探针保持匿名（供脚本探活）', routeFor('/health').auth === 'none');
ok('写路由全部要求凭据', ROUTES.filter((r) => r.mutating).every((r) => r.auth === 'token'));
ok('高风险写入集中在已知的五个路由', summary.mutating.length === 5, summary.mutating.join(' '));
ok('策略已执行', POLICY_ENFORCED === true && summary.enforced === true);
ok('控制台确实加载了认证原语（不是只写在表里）', /tokenMatches|console-auth/.test(source), 'console-server 需要 import console-auth');

console.log(fail ? 'ROUTE_POLICY_FAILED ' + fail : 'ROUTE_POLICY_OK');
console.log('提示：本测试保证「清单与实现一致」；认证本身由 test-console-auth 用真实 HTTP 证明。');
process.exitCode = fail ? 1 : 0;
