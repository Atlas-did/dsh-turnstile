'use strict';
// 注册表快照差异：纯函数，方便直接测（来源是 reg query 的输出）。
// 为什么要它：文件监听管不到「注册表被改」——环境变量、文件关联、COM 注册都在注册表里。

export function parseRegQuery(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(HKEY_|HKLM|HKCU|HKCR|HKU|HKCC)/i.test(line)) continue;
    const m = /^(\S+)\s+(REG_[A-Z_]+)\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = { type: m[2], value: m[3] };
  }
  return out;
}

export function diffSnapshots(prev, next) {
  const changes = [];
  const a = prev || {};
  const b = next || {};
  for (const name of Object.keys(b).sort()) {
    if (!(name in a)) changes.push({ name, event: 'added', value: b[name].value, type: b[name].type });
    else if (a[name].value !== b[name].value) changes.push({ name, event: 'changed', value: b[name].value, was: a[name].value, type: b[name].type });
  }
  for (const name of Object.keys(a).sort()) if (!(name in b)) changes.push({ name, event: 'removed', was: a[name].value });
  return changes;
}

if (typeof window !== 'undefined') window.TurnstileRegDiff = { parseRegQuery, diffSnapshots };
