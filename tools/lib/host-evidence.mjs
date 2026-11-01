// 真实宿主加载证据的结构与校验。这里只验证证据，不负责重启宿主。
// 任何孤立 HTTP 200、最小隔离宿主结果或上一次启动的旧证据都不能通过。
import { isAbsolute, resolve } from 'node:path';

const text = (v) => typeof v === 'string' && v.trim().length > 0;
const time = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function validateHostEvidence(raw, { target, profile, trialAt } = {}) {
  const errors = [];
  const fail = (condition, message) => { if (!condition) errors.push(message); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['证据必须是 JSON 对象'] };
  }
  fail(raw.schema === 'turnstile/host-evidence@1', 'schema 必须是 turnstile/host-evidence@1');
  fail(raw.scope === 'real-dsh-host' && raw.realDsh === true, '证据范围必须是真实 DSH 宿主，隔离宿主不能冒充');
  fail(text(raw.target), '缺少插件包名 target');
  if (target) fail(raw.target === target, '证据插件与本次试装目标不一致');
  fail(text(raw.profile) && isAbsolute(raw.profile), 'profile 必须是绝对路径');
  if (profile && text(raw.profile)) fail(resolve(raw.profile) === resolve(profile), '证据 profile 与本次试装不一致');
  fail(time(raw.capturedAt), 'capturedAt 必须是有效时间');
  if (time(raw.capturedAt) && trialAt) {
    fail(time(trialAt) && Date.parse(raw.capturedAt) > Date.parse(trialAt), '宿主证据必须晚于最近一次试装');
  }

  const host = raw.host || {};
  fail(host.kind === 'dsh', 'host.kind 必须是 dsh');
  fail(text(host.runtimeVersion), '缺少真实宿主 runtimeVersion');
  fail(text(host.runtimeBin) && isAbsolute(host.runtimeBin), 'runtimeBin 必须是真实运行时绝对路径');
  fail(Number.isInteger(host.processId) && host.processId > 0, '缺少有效宿主 processId');
  fail(text(host.bootId), '缺少本次启动 bootId');

  const restart = raw.restart || {};
  fail(restart.observed === true, '必须实际观察到宿主重启');
  fail(text(restart.beforeBootId) && text(restart.afterBootId), '缺少重启前后 bootId');
  fail(restart.beforeBootId !== restart.afterBootId, '重启前后 bootId 必须不同');
  fail(restart.afterBootId === host.bootId, '重启后的 bootId 必须与宿主证据一致');

  const installation = raw.installation || {};
  fail(installation.packageJson === true, '没有确认插件 package.json 已安装');
  fail(installation.bundleListed === true, '没有确认插件已列入 profile bundles');

  const route = raw.route || {};
  fail(text(route.path) && /^\/(?!\/)/.test(route.path), '目标路由必须是站内绝对路径');
  fail(route.status === 200, '目标路由必须实际返回 HTTP 200');
  fail(Number.isInteger(route.bodyBytes) && route.bodyBytes > 0, '目标路由必须返回非空内容');
  fail(text(route.bodySha256) && /^[a-f0-9]{64}$/i.test(route.bodySha256), '目标路由内容必须有 SHA-256');
  return { ok: errors.length === 0, errors };
}
