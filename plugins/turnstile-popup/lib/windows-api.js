'use strict';
// ctx.windows：宿主进程内的 Windows 能力接口（插件直接 import，不再每次 fork CLI）。
//
// 实现方式：第一次调用时启动**一个**常驻 UIA 进程（tools/uia-host.ps1），之后所有插件共用它。
// 这不是原生绑定（那要 npm 原生模块），但已经解决了「每次 fork 付启动费」这个真问题。
//
// 安全：所有操作类动作先过 windows-gate（声明 + 审计）；只读动作也记审计。
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';
import { declared, decide, auditLine } from './windows-gate.js';

const here = dirname(fileURLToPath(import.meta.url));
let clientPromise = null;
let auditPath = null;

export function setAuditPath(p) { auditPath = p; }

function audit(plugin, action, verdict, reason) {
  if (!auditPath) return;
  try { mkdirSync(dirname(auditPath), { recursive: true }); appendFileSync(auditPath, auditLine({ plugin, action, verdict, reason })); } catch {}
}

async function client() {
  if (!clientPromise) {
    // Windows 的绝对路径不能直接 import，必须转成 file:// URL
    const start = await import(pathToFileURL(join(here, '..', '..', '..', 'tools', 'uia-client.mjs')).href);
    clientPromise = start.startUia();
  }
  return clientPromise;
}

const READ_ACTIONS = new Set(['windows', 'find', 'text']);

/**
 * 插件入口：windowsApi({ plugin, pkg }) 返回一组带闸门的方法。
 * 只读方法记审计但不拦；操作类必须声明 act，否则抛错（错误信息可直接给用户看）。
 */
export function windowsApi({ plugin = '', pkg = null } = {}) {
  const caps = declared(pkg || {});

  const call = async (action, payload, { timeoutMs = 30000 } = {}) => {
    const isRead = READ_ACTIONS.has(action);
    if (!isRead) {
      const v = decide(caps, 'uia.act');
      audit(plugin, 'uia.act:' + action, v.allow ? 'allow' : 'deny', v.reason);
      if (!v.allow) throw new Error(v.reason);
    } else {
      audit(plugin, 'uia.' + action, 'allow', 'read');
    }
    const c = await client();
    const res = await c.request({ action, ...payload }, { timeoutMs });
    if (!res.ok) throw new Error(res.error || 'UIA 调用失败');
    return res.data;
  };

  return {
    capabilities: caps,
    listWindows: () => call('windows', {}),
    find: (name) => call('find', { name }),
    focus: (name) => call('focus', { name }),
    invoke: (name) => call('invoke', { name }),
    toggle: (name) => call('toggle', { name }),
    setValue: (name, value) => call('setvalue', { name, value }),
    close: async () => { if (clientPromise) { const c = await clientPromise; await c.close(); clientPromise = null; } },
  };
}

if (typeof window !== 'undefined') window.TurnstileWindowsApi = { windowsApi };
