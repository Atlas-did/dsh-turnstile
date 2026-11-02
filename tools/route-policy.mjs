#!/usr/bin/env node
// 打印控制台路由策略表：哪些路由读、哪些写、谁需要凭据（方案 §7-1A）。
// 只读：不启动服务器、不改任何文件。
import { ROUTES, authPolicySummary } from './lib/routes.mjs';

const summary = authPolicySummary();
console.log('routes: ' + summary.total + ' | auth=token ' + summary.byAuth.token + ' | auth=none ' + summary.byAuth.none);
console.log('POLICY_ENFORCED: ' + (summary.enforced ? 'true' : 'false（只声明；当前任何本机请求都能调用这些路由）'));
console.log('');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('kind', 10) + pad('auth', 6) + pad('mutating', 9) + pad('state', 6) + 'path');
for (const r of ROUTES) {
  console.log(pad(r.kind, 10) + pad(r.auth, 6) + pad(r.mutating ? 'yes' : '-', 9) + pad(r.stateWrite ? 'yes' : '-', 6) + r.path);
}
console.log('');
console.log('写路由: ' + summary.mutating.join(', '));
console.log('只写状态: ' + (summary.stateWrites.join(', ') || '（无）'));
