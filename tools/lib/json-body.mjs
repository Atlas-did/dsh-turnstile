'use strict';
// 共享的请求体读取：超限必须返回 413，而不是 req.destroy() 让客户端看到 socket 错误（复审 P2-2）。

export class BodyTooLarge extends Error {
  constructor(limit) { super('请求体超过 ' + limit + ' 字节'); this.code = 'BODY_TOO_LARGE'; this.limit = limit; }
}

/** 读 JSON 体；超过 maxBytes 抛 BodyTooLarge（调用方回 413）。 */
export async function readJsonBody(req, { maxBytes = 1e6 } = {}) {
  let body = '';
  let tooBig = false;
  for await (const chunk of req) {
    if (tooBig) continue; // 继续排空，保证响应能发出去
    body += chunk;
    if (body.length > maxBytes) { tooBig = true; body = ''; }
  }
  if (tooBig) throw new BodyTooLarge(maxBytes);
  if (!body.trim()) return {};
  return JSON.parse(body);
}

/** 统一在路由里用：返回 {ok, value} 或 {ok:false, status, error}。 */
export async function readJsonOr413(req, res, helpers, opts) {
  try {
    const value = await readJsonBody(req, opts);
    return { ok: true, value };
  } catch (e) {
    if (e && e.code === 'BODY_TOO_LARGE') {
      helpers.json(res, 413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' });
      return { ok: false, status: 413 };
    }
    helpers.json(res, 400, { error: 'body 不是 JSON：' + String(e.message).slice(0, 120) });
    return { ok: false, status: 400 };
  }
}

/** 只要原始文本，同样有上限。 */
export async function readJsonText(req, maxBytes = 1000000) {
  let body = '';
  let tooBig = false;
  for await (const chunk of req) {
    if (tooBig) continue;
    body += chunk;
    if (body.length > maxBytes) { tooBig = true; body = ''; }
  }
  if (tooBig) throw new BodyTooLarge(maxBytes);
  return body;
}
