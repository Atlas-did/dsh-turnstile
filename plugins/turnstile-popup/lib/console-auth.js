'use strict';
// 控制台/宿主共用的认证原语（整合计划 §7-1A，C-01）。
// 只做「这次请求能不能进、拿什么比对」，不含任何路由业务。
// 决策记录（本会话逐题定）：Q1=A 每启动随机令牌；Q3=2 页面/资源/数据/写全要凭据，
// /health 只有 ok 字段；Q4=1 不留关认证的开关；Q6=Origin 与 Host 都要白名单。

import { timingSafeEqual, createHash } from 'node:crypto';

// 只允许本机来源与主机名；DNS rebinding 靠 Host 挡，跨站靠 Origin + SameSite cookie 挡。
export const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export function originAllowed(origin) {
  if (!origin) return true; // 没有 Origin 的是 CLI/curl，另由令牌把关
  const m = String(origin).match(/^https?:\/\/(.+)$/);
  return Boolean(m && LOOPBACK.test(m[1]));
}

export function hostAllowed(hostHeader) {
  if (!hostHeader) return true; // HTTP/1.0 无 Host；令牌仍然要过
  return LOOPBACK.test(String(hostHeader));
}

// 引导页：只有这三条路由接受 ?token=（令牌进 URL 只应发生在引导那一次）
export const PAGE_ROUTES = new Set(['/', '/console', '/turnstile/builder']);

export function parseCookie(header, name) {
  const raw = String(header || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); }
  }
  return '';
}

export const SESSION_COOKIE = 'turnstile_session';

export function credentialOf(req, { allowQuery = false } = {}) {
  const header = String(req.headers['x-turnstile-token'] || '').trim();
  if (header) return header;
  const cookie = parseCookie(req.headers.cookie, SESSION_COOKIE).trim();
  if (cookie) return cookie;
  if (allowQuery) {
    try {
      const q = new URL(String(req.url || ''), 'http://127.0.0.1').searchParams.get('token');
      return String(q || '').trim();
    } catch { return ''; }
  }
  return '';
}

// 定长摘要 + timingSafeEqual：不因为前缀匹配或长度差异泄露信息
export function tokenMatches(expected, presented) {
  if (!expected || !presented) return false;
  const a = createHash('sha256').update(String(expected)).digest();
  const b = createHash('sha256').update(String(presented)).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie(token, { maxAge = 86400, secure = false } = {}) {
  const parts = [SESSION_COOKIE + '=' + encodeURIComponent(token), 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + maxAge];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
