'use strict';
// 统一的请求体读取：所有 POST 路由都走这里，超限返回 413 而不是断开连接。
export const BODY_TOO_LARGE = 'BODY_TOO_LARGE';
const DEFAULT_MAX = 1e6;

export async function readJsonBody(req, { maxBytes = DEFAULT_MAX } = {}) {
  let body = '';
  let tooBig = false;
  for await (const chunk of req) {
    if (tooBig) continue;
    body += chunk;
    if (body.length > maxBytes) { tooBig = true; body = ''; }
  }
  if (tooBig) { const e = new Error('body too large'); e.code = BODY_TOO_LARGE; e.limit = maxBytes; throw e; }
  if (!body.trim()) return {};
  return JSON.parse(body);
}

/** 只要原始文本（调用方自己 JSON.parse）：同样有上限。 */
export async function readJsonText(req, maxBytes = DEFAULT_MAX) {
  let body = '';
  let tooBig = false;
  for await (const chunk of req) {
    if (tooBig) continue;
    body += chunk;
    if (body.length > maxBytes) { tooBig = true; body = ''; }
  }
  if (tooBig) { const e = new Error('body too large'); e.code = BODY_TOO_LARGE; e.limit = maxBytes; throw e; }
  return body;
}

export async function readJsonReply(req, sendJson, { maxBytes = DEFAULT_MAX } = {}) {
  try {
    return { ok: true, value: await readJsonBody(req, { maxBytes }) };
  } catch (e) {
    if (e && e.code === BODY_TOO_LARGE) { sendJson(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' }); return { ok: false, status: 413 }; }
    sendJson(400, { error: 'body 不是 JSON：' + String(e.message).slice(0, 120) });
    return { ok: false, status: 400 };
  }
}
