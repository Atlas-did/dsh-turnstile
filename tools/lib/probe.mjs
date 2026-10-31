// 分层探测：DNS → TCP → TLS → HTTP，每层单独记录。
//
// 为什么分层：2026-10-31 我用 `curl -x 31181 https://github.com` 得到 000 就判环境故障，
// 实际是 curl 没带 CA（方法错误）。分层之后，「TLS 失败但 CA 文件存在且未加载」能被识别成方法问题。
//
// 只报告事实，不下结论（结论在 diagnose 里）。
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { lookup as dnsLookup } from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';

export function tlsErrorIsMethodProblem(err, caFile) {
  const msg = String((err && err.message) || '');
  const code = String((err && err.code) || '');
  const selfSigned = /self[- ]signed|unable to verify|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED/.test(msg + ' ' + code);
  return selfSigned && Boolean(caFile) && existsSync(caFile);
}

export async function probeLayers(url, { caFile = null, timeoutMs = 6000 } = {}) {
  const u = new URL(url);
  const host = u.hostname;
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const out = { url, layers: { dns: 'unknown', tcp: 'unknown', tls: 'unknown', http: 'unknown' }, ms: {}, error: null, methodProblem: false };

  const t0 = Date.now();
  try { await dnsLookup(host); out.layers.dns = 'ok'; } catch (e) { out.layers.dns = 'fail'; out.error = e.code || e.message; return out; }
  out.ms.dns = Date.now() - t0;

  const t1 = Date.now();
  const tcpOk = await new Promise((resolve) => {
    const s = netConnect({ host, port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(timeoutMs);
    s.once('connect', () => done(true));
    s.once('timeout', () => { out.error = 'tcp timeout'; done(false); });
    s.once('error', (e) => { out.error = e.code || e.message; done(false); });
  });
  out.layers.tcp = tcpOk ? 'ok' : 'fail';
  out.ms.tcp = Date.now() - t1;
  if (!tcpOk) return out;

  if (u.protocol !== 'https:') { out.layers.tls = 'n/a'; out.layers.http = 'unknown'; return out; }

  const t2 = Date.now();
  const tlsResult = await new Promise((resolve) => {
    const opts = { host, port, servername: host };
    if (caFile && existsSync(caFile)) opts.ca = readFileSync(caFile);
    const s = tlsConnect(opts);
    const done = (v, err) => { s.destroy(); resolve({ ok: v, err }); };
    s.setTimeout(timeoutMs);
    s.once('secureConnect', () => done(true));
    s.once('timeout', () => done(false, new Error('tls timeout')));
    s.once('error', (e) => done(false, e));
  });
  out.layers.tls = tlsResult.ok ? 'ok' : 'fail';
  out.ms.tls = Date.now() - t2;
  if (!tlsResult.ok) {
    out.error = tlsResult.err ? (tlsResult.err.code || tlsResult.err.message) : 'tls fail';
    out.methodProblem = tlsErrorIsMethodProblem(tlsResult.err, caFile);
    return out;
  }

  const t3 = Date.now();
  const httpsMod = await import('node:https');
  const httpCode = await new Promise((resolve) => {
    const opts = { host, port, path: u.pathname || '/', method: 'GET', timeout: timeoutMs, headers: { 'user-agent': 'dsh-diagnose' } };
    if (caFile && existsSync(caFile)) opts.ca = readFileSync(caFile);
    const req = httpsMod.request(opts, (res) => { resolve(res.statusCode); res.destroy(); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
  out.ms.http = Date.now() - t3;
  out.layers.http = httpCode ? String(httpCode) : 'fail';
  if (!httpCode) out.error = 'http no response';
  return out;
}