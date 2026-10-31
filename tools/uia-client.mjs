#!/usr/bin/env node
// UIA 常驻客户端：一条 PowerShell 进程活着，用 JSON 行做请求/响应。
//
// 为什么不再「一次调用 fork 一个 PowerShell」：fork 一次 ~1s，深集成场景是连续操作（列→找→点→读），
// fork 版本每步都要付启动费。常驻后一次握手，之后每次几十毫秒。
//
// 用法（库）：
//   const c = await startUia();
//   await c.request({ action: 'windows' }, { timeoutMs: 8000 });
//   await c.close();
//
// 安全：这里只提供通道与超时/中断；是否允许某个动作由能力网关（lib/windows-gate.js）决定，不在这里放行。
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const HOST = join(here, 'uia-host.ps1');

export class UiaTimeout extends Error {
  constructor(sec) { super('UIA 请求超时（' + sec + 'ms）'); this.name = 'UiaTimeout'; }
}

export async function startUia({ idleSeconds = 900 } = {}) {
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HOST, '-IdleSeconds', String(idleSeconds)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pending = new Map();
  let seq = 0;
  let stderr = '';
  child.stderr.on('data', (b) => { stderr += String(b); });
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    const text = line.replace(/\uFEFF/g, '').trim();
    if (!text.startsWith('{')) return;
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    slot.resolve(msg);
  });
  let closed = false;
  child.once('exit', () => {
    closed = true;
    for (const [, slot] of pending) slot.reject(new Error('UIA 进程退出：' + stderr.split('\n')[0].slice(0, 120)));
    pending.clear();
  });

  const request = (payload, { timeoutMs = 8000 } = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error('UIA 进程已退出')); return; }
    const id = 'r' + (seq += 1);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new UiaTimeout(timeoutMs));
    }, timeoutMs);
    pending.set(id, {
      resolve: (msg) => { clearTimeout(timer); resolve(msg); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
  });

  const close = () => new Promise((resolve) => {
    if (closed) return resolve();
    try { child.stdin.end(); } catch {}
    const t = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 1500);
    child.once('exit', () => { clearTimeout(t); resolve(); });
  });

  const ping = await request({ action: 'ping' }, { timeoutMs: 15000 });
  if (!ping || !ping.ok) { await close(); throw new Error('UIA 进程握手失败：' + stderr.split('\n')[0].slice(0, 120)); }

  return { request, close, get pid() { return child.pid; }, stderr: () => stderr };
}
