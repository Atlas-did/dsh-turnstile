'use strict';
// POST /turnstile/run 的实现（纯函数，插件与控制台服务共用）。
//
// 契约（来自 02 设计 §4.2）：
//   入参 { command, args, dryRun, applyToken, confirm }
//   出参 { ok, verdict, summary, plan, diff, exitCode, evidence, next, durationMs, applyToken? }
//
// 写操作硬约束（在服务端强制，不依赖前端自觉）：
//   1. mutating 命令必须 dryRun:true 才允许执行，响应里签发一次性 applyToken；
//   2. applyToken 绑定 command+args 的哈希，5 分钟过期；
//   3. 同一命令 2s 内去重（防连点）。
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 命令注册表在 tools/lib/commands.mjs。live 部署时插件被同步到 research/ 下，
// 与 tools/ 不在同一棵树，所以按候选路径动态 import（静态 import 会 404）。
let registryPromise = null;
async function registry({ toolsRoot } = {}) {
  if (registryPromise) return registryPromise;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    toolsRoot && join(toolsRoot, 'lib', 'commands.mjs'),
    process.env.DSH_TURNSTILE_HOME && join(process.env.DSH_TURNSTILE_HOME, 'tools', 'lib', 'commands.mjs'),
    join(here, '..', '..', '..', 'tools', 'lib', 'commands.mjs'),
    join(here, '..', '..', 'tools', 'lib', 'commands.mjs'),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('找不到命令注册表 tools/lib/commands.mjs（候选：' + candidates.join(' | ') + '）');
  registryPromise = await import(pathToFileURL(found).href);
  return registryPromise;
}

const tokens = new Map(); // token -> { hash, expires, used }
const recent = new Map(); // hash -> timestamp
const TTL = 5 * 60 * 1000;
const DEDUPE = 2000;

function hashOf(command, args) {
  return createHash('sha256').update(command + '|' + JSON.stringify(args || {})).digest('hex').slice(0, 32);
}

function sweep(now) {
  for (const [k, v] of tokens) if (v.expires < now || v.used) tokens.delete(k);
}

export async function handleRun(body, { toolsRoot } = {}) {
  const { COMMANDS, runCommand } = await registry({ toolsRoot });
  const command = String((body && body.command) || '').trim();
  const args = (body && body.args) || {};
  const dryRun = body && body.dryRun === true;
  const spec = COMMANDS[command];
  if (!spec) return { status: 404, body: { ok: false, verdict: 'unknown', summary: '未知命令：' + command + '（白名单里没有）' } };

  const hash = hashOf(command, args);
  const now = Date.now();
  sweep(now);

  // 写操作：没有 dryRun 且没有有效 token → 403
  if (spec.mutating) {
    if (!dryRun) {
      const token = String((body && body.applyToken) || '');
      const rec = tokens.get(token);
      if (!rec || rec.expires < now || rec.used) {
        return { status: 403, body: { ok: false, verdict: 'unknown', summary: '写操作必须先 dry-run：缺少或无效的 applyToken', next: ['先用 dryRun:true 调一次，拿 applyToken'] } };
      }
      if (rec.hash !== hash) {
        return { status: 403, body: { ok: false, verdict: 'unknown', summary: 'applyToken 与本次参数不匹配（参数被改过？）' } };
      }
      rec.used = true;
    } else {
      const last = recent.get(hash) || 0;
      if (now - last < DEDUPE) return { status: 429, body: { ok: false, verdict: 'unknown', summary: '同一命令 2 秒内重复请求（防连点）' } };
      recent.set(hash, now);
    }
  }

  const result = runCommand(command, args, { toolsRoot });
  const out = { ...result };
  if (spec.mutating && dryRun && result.exitCode === 0) {
    const token = randomUUID();
    tokens.set(token, { hash, expires: now + TTL, used: false });
    out.applyToken = token;
    out.dryRun = true;
  }
  // 未知/失败命令给「下一步」建议，而不是只报错
  if (!out.next || !out.next.length) {
    out.next = out.ok ? [] : ['node tools/turnstile.mjs help', '看 evidence 里的 stderr 原文'];
  }
  return { status: 200, body: out };
}

/** 仅供测试：清空 token 与去重状态。 */
export function _resetForTests() { tokens.clear(); recent.clear(); }
