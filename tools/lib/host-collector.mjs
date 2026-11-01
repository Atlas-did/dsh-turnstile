// 两阶段宿主观察：before 只保存公开启动标识；after 关联新启动、安装状态与真实路由。
// 适配器内部可使用 token，但 session/evidence 永远不保存 token。
import { resolve } from 'node:path';
import { validateHostEvidence } from './host-evidence.mjs';

const publicBoot = (boot) => ({
  processId: boot.processId,
  bootId: boot.bootId,
  port: boot.port,
  observedAt: new Date().toISOString(),
});

export async function beginHostObservation({ profile, target }, adapter) {
  if (!profile || !target) throw new Error('开始观察需要 profile 与插件包名');
  if (!adapter || adapter.scope !== 'real-dsh-host') throw new Error('宿主适配器必须明确绑定真实 DSH');
  const runtime = await adapter.describeRuntime({ profile: resolve(profile), target });
  const before = await adapter.readBoot();
  return {
    schema: 'turnstile/host-observation@1',
    target,
    profile: resolve(profile),
    createdAt: new Date().toISOString(),
    runtime: { kind: 'dsh', version: runtime.version, bin: runtime.bin },
    before: publicBoot(before),
  };
}

export async function finishHostObservation(session, { route }, adapter) {
  if (!session || session.schema !== 'turnstile/host-observation@1') throw new Error('不是有效的宿主观察 session');
  if (!adapter || adapter.scope !== 'real-dsh-host') throw new Error('宿主适配器必须明确绑定真实 DSH');
  const runtime = await adapter.describeRuntime({ profile: session.profile, target: session.target });
  const after = await adapter.readBoot();
  const installation = await adapter.checkInstallation({ profile: session.profile, target: session.target });
  const routePath = route || '/' + session.target;
  const response = await adapter.fetchRoute(routePath, after);
  const evidence = {
    schema: 'turnstile/host-evidence@1',
    scope: 'real-dsh-host',
    realDsh: true,
    target: session.target,
    profile: resolve(session.profile),
    capturedAt: new Date().toISOString(),
    host: {
      kind: 'dsh',
      runtimeVersion: runtime.version,
      runtimeBin: runtime.bin,
      processId: after.processId,
      bootId: after.bootId,
    },
    restart: {
      observed: session.before.bootId !== after.bootId,
      beforeBootId: session.before.bootId,
      afterBootId: after.bootId,
    },
    installation,
    route: {
      path: routePath,
      status: response.status,
      bodyBytes: response.bodyBytes,
      bodySha256: response.bodySha256,
    },
  };
  const validation = validateHostEvidence(evidence, { target: session.target, profile: session.profile });
  return { ok: validation.ok, errors: validation.errors, evidence };
}
