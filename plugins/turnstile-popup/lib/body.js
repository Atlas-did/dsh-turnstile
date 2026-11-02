'use strict';
// 统一的请求体读取：所有 POST 路由都走这里，超限返回 413 而不是断开连接。
export const BODY_TOO_LARGE = 'BODY_TOO_LARGE';
const DEFAULT_MAX = 1e6;

// 上限按**字节**算（C-07）：body.length 是 UTF-16 码元数，中文/emoji 会被低估 3-4 倍，
// 于是「看起来没超」的请求实际已经超过声明的上限。分块累计 Buffer 长度才是真字节。
async function readBodyText(req, maxBytes) {
  const chunks = [];
  let bytes = 0;
  let tooBig = false;
  for await (const chunk of req) {
    if (tooBig) continue; // 继续把流读完，避免半截连接；但不再累计
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buf.length;
    if (bytes > maxBytes) { tooBig = true; chunks.length = 0; continue; }
    chunks.push(buf);
  }
  if (tooBig) { const e = new Error('body too large'); e.code = BODY_TOO_LARGE; e.limit = maxBytes; throw e; }
  return Buffer.concat(chunks).toString('utf8');
}

export { readBodyText };

export async function readJsonBody(req, { maxBytes = DEFAULT_MAX } = {}) {
  const body = await readBodyText(req, maxBytes);
  if (!body.trim()) return {};
  return JSON.parse(body);
}

/** 只要原始文本（调用方自己 JSON.parse）：同样有上限。 */
export async function readJsonText(req, maxBytes = DEFAULT_MAX) {
  return readBodyText(req, maxBytes);
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
