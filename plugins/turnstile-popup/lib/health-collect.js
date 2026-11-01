'use strict';
// 健康项的真实采集：宿主与控制台共用这一份，避免两边路径/判定漂移（复审 P1）。
// 只做「读文件 → 调 health.js 的 item 构造器」，不含 pits（pits 需要 tools/pits.mjs）。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as health from './health.js';

export function resolveHome(env = process.env) {
  return env.DSH_HOME || join(env.USERPROFILE || env.HOME || '', '.dsh');
}

function bridgeCandidates(home, env = process.env) {
  return [
    join(env.USERPROFILE || '', '.agents-anywhere', 'dsh-bridge', 'endpoint.json'),
    join(home, 'agents-anywhere', 'bridge', 'endpoint.json'),
  ].filter(Boolean);
}

/** 凭据键名（只读键，不读值） */
export function credentialKeys(file) {
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => (/^([A-Za-z0-9._-]+)\s*:/.exec(l) || [])[1])
      .filter(Boolean);
  } catch { return []; }
}

/** 声明了但没装的 bundle：先看 profile 的 node_modules，再让宿主解析（asar 里的不算缺） */
export function missingBundles(profileDir, hostBases = []) {
  let bundles = [];
  try { bundles = (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dsh || {}).profile?.bundles || []; } catch {}
  const hostProvided = [];
  const missing = [];
  for (const n of bundles) {
    if (existsSync(join(profileDir, 'node_modules', n))) continue;
    let hostHas = false;
    for (const base of hostBases) {
      if (hostHas || !base) continue;
      try { createRequire(base).resolve(n); hostHas = true; } catch {}
    }
    if (hostHas) hostProvided.push(n); else missing.push(n);
  }
  return { total: bundles.length, hostProvided, missing };
}

/** 采集全部健康项。返回 { items, notes } */
export function collectHealth({ profileDir, home, hostBases = [], env = process.env } = {}) {
  const dshHome = home || resolveHome(env);
  const items = [];
  const notes = [];

  const credFile = join(dshHome, '.credentials.yaml');
  items.push(health.credentialsItem({ exists: existsSync(credFile), keys: credentialKeys(credFile) }));

  const candidates = bridgeCandidates(dshHome, env);
  const endpoint = candidates.find((p) => existsSync(p)) || candidates[0];
  const bridgeInstalled = existsSync(join(profileDir, 'node_modules', '@agents-anywhere', 'dsh-bridge-next'));
  if (bridgeInstalled || existsSync(endpoint)) {
    let mtimeMs = 0;
    try { if (existsSync(endpoint)) mtimeMs = statSync(endpoint).mtimeMs; } catch {}
    items.push(health.bridgeItem({ exists: existsSync(endpoint), mtimeMs }));
  } else {
    notes.push('未安装 bridge，跳过 bridge 检查');
  }

  const b = missingBundles(profileDir, hostBases);
  items.push(health.bundlesItem({ total: b.total, hostProvided: b.hostProvided, missing: b.missing }));
  items.push(health.authItem({ total: null }));
  return { items, notes, bundles: b };
}
