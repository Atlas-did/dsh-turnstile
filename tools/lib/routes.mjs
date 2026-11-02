'use strict';
// 控制台路由策略表（整合计划 §7-1A / C-01）。
// 目的：把「哪些路由只是静态资源、哪些读数据、哪些写 profile」写在一处，
// 这样新增路由不能悄悄绕过认证，也不会出现「页面能点、CLI 没有」的两套语义。
//
// 现状：console-server.mjs 已在每个路由前执行本策略（Host/Origin 白名单 + 每启动令牌），
// 所以 POLICY_ENFORCED = true；test-console-auth 用真实 HTTP 证明未认证请求被拒。
// 宿主侧（plugins/turnstile-popup/lib/index.js）仍只查令牌字段存在，属于 C-02，另行处理。
//
// 字段：
//   kind      page | asset | read | state | write | liveness
//   methods   允许的方法（与实现里的 method 判断一致）
//   auth      'token' = 需要每启动凭据；'none' = 仅存活探针
//   mutating  会改 profile / 页面 / 插件包 / 任意用户文件
//   stateWrite 只写 .turnstile 状态（审计、缓存），不改用户配置
//   bodyLimit POST 正文上限（字节）；0 表示不做正文解析

export const POLICY_ENFORCED = true;

const page = (path) => ({ path, kind: 'page', methods: ['GET'], auth: 'token', mutating: false, stateWrite: false, bodyLimit: 0 });
const asset = (path) => ({ path, kind: 'asset', methods: ['GET'], auth: 'token', mutating: false, stateWrite: false, bodyLimit: 0 });
const read = (path, methods = ['GET']) => ({ path, kind: 'read', methods, auth: 'token', mutating: false, stateWrite: false, bodyLimit: 0 });
const write = (path, methods = ['POST'], bodyLimit = 131072) => ({ path, kind: 'write', methods, auth: 'token', mutating: true, stateWrite: false, bodyLimit });

export const ROUTES = [
  page('/'),
  page('/console'),
  page('/turnstile/builder'),
  page('/turnstile/view'),
  { path: '/health', kind: 'liveness', methods: ['GET'], auth: 'none', mutating: false, stateWrite: false, bodyLimit: 0 },

  asset('/turnstile/tokens.css'),
  asset('/turnstile/capabilities.js'),
  asset('/turnstile/history-timeline.js'),
  asset('/turnstile/selection.js'),
  asset('/turnstile/field-schema.js'),
  asset('/turnstile/hooks.js'),
  asset('/turnstile/hook-rules.js'),
  asset('/turnstile/virtual-window.js'),
  asset('/turnstile/annotations.js'),
  asset('/turnstile/locator.js'),
  asset('/turnstile/diff-state.js'),
  asset('/turnstile/inspector-model.js'),
  asset('/turnstile/sort-context.js'),
  asset('/turnstile/page-model.js'),
  asset('/turnstile/page-render.js'),
  asset('/turnstile/page-validate.js'),
  asset('/turnstile/console-designer.js'),
  asset('/turnstile/console-navigation.js'),
  asset('/turnstile/console-annotation-picker.js'),
  asset('/turnstile/console-annotation-pick.js'),
  asset('/turnstile/console-annotations.js'),

  read('/api/console'),
  read('/turnstile/diagnose'),
  read('/turnstile/profiles'),
  read('/turnstile/inspect'),
  read('/turnstile/search'),
  read('/turnstile/health'),
  read('/turnstile/hooks'),
  read('/turnstile/audit'),
  read('/turnstile/issue-recheck', ['POST']),
  { path: '/turnstile/slot-map', kind: 'state', methods: ['POST'], auth: 'token', mutating: false, stateWrite: true, bodyLimit: 131072 },

  { path: '/turnstile/view-state', kind: 'state', methods: ['GET', 'POST'], auth: 'token', mutating: false, stateWrite: true, bodyLimit: 65536 },
  { path: '/turnstile/page', kind: 'write', methods: ['GET', 'POST'], auth: 'token', mutating: true, stateWrite: false, bodyLimit: 1048576 },
  write('/turnstile/run', ['POST'], 1048576),
  write('/turnstile/designer'),
  write('/turnstile/toggle'),
  write('/turnstile/export'),
];

export function routeFor(pathname) {
  const hit = ROUTES.find((r) => r.path === pathname);
  return hit || null;
}

export function authPolicySummary() {
  const by = { token: 0, none: 0 };
  for (const r of ROUTES) by[r.auth] = (by[r.auth] || 0) + 1;
  return {
    enforced: POLICY_ENFORCED,
    total: ROUTES.length,
    byAuth: by,
    mutating: ROUTES.filter((r) => r.mutating).map((r) => r.path),
    stateWrites: ROUTES.filter((r) => r.stateWrite).map((r) => r.path),
  };
}
