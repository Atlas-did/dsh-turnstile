// mini 的真实 DSH 适配器。只观察进程、运行时、profile 与 HTTP；不启动或停止进程。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const psQuote = (value) => String(value).replace(/'/g, "''");

function windowsProcessFinder(runtimeBin) {
  const script = `$needle='${psQuote(runtimeBin)}'; Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } | Select-Object -First 1 -ExpandProperty ProcessId | ConvertTo-Json`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 15000 });
  const pid = Number(String(out).trim().replace(/["\r\n]/g, ''));
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('找不到使用此 mini 运行时的 node 进程');
  return pid;
}

export function createMiniHostAdapter({ mini, findProcess } = {}) {
  if (!mini) throw new Error('createMiniHostAdapter 需要 mini 根目录');
  const root = resolve(mini);
  const runtimeBin = join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const runtimePkg = join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  const logFile = join(root, 'logs', 'mini.log');
  const processFor = findProcess || (() => windowsProcessFinder(runtimeBin));

  function latestUrl() {
    const text = existsSync(logFile) ? readFileSync(logFile, 'utf8').slice(-200000) : '';
    const all = [...text.matchAll(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/g)];
    const match = all.at(-1);
    if (!match) throw new Error('mini.log 中没有带 token 的宿主 URL');
    return { port: Number(match[1]), token: match[2] };
  }

  return {
    scope: 'real-dsh-host',
    async describeRuntime({ profile }) {
      if (!existsSync(runtimeBin) || !existsSync(runtimePkg)) throw new Error('找不到 mini 的真实 DSH 运行时');
      const profiles = join(root, 'home', 'profiles');
      const rel = relative(profiles, resolve(profile));
      if (!rel || rel.startsWith('..') || rel.includes('/') || rel.includes('\\')) throw new Error('profile 必须是该 mini/home/profiles 的直接子目录');
      const manifest = JSON.parse(readFileSync(runtimePkg, 'utf8'));
      if (manifest.name !== '@deepseek-ai/dsh' || !manifest.version) throw new Error('运行时 package.json 身份不符');
      return { version: manifest.version, bin: runtimeBin };
    },
    async readBoot() {
      const current = latestUrl();
      const processId = Number(await processFor());
      if (!Number.isInteger(processId) || processId <= 0) throw new Error('宿主进程 PID 无效');
      const response = await fetch(`http://127.0.0.1:${current.port}/?token=${encodeURIComponent(current.token)}`, { signal: AbortSignal.timeout(8000) });
      if (response.status !== 200) throw new Error('带当前 token 的宿主根路由未返回 200：' + response.status);
      await response.arrayBuffer();
      return { ...current, processId, bootId: sha256(processId + '|' + current.token) };
    },
    async checkInstallation({ profile, target }) {
      const packageJson = existsSync(join(profile, 'node_modules', target, 'package.json'));
      let bundleListed = false;
      try {
        const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
        bundleListed = Array.isArray(manifest.dsh?.profile?.bundles) && manifest.dsh.profile.bundles.includes(target);
      } catch {}
      return { packageJson, bundleListed };
    },
    async fetchRoute(path, boot) {
      const url = new URL(path, `http://127.0.0.1:${boot.port}`);
      url.searchParams.set('token', boot.token);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const body = Buffer.from(await response.arrayBuffer());
      return { status: response.status, bodyBytes: body.length, bodySha256: sha256(body) };
    },
  };
}
