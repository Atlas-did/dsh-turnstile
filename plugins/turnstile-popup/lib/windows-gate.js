'use strict';
// Windows 能力网关（草案）：插件必须在 manifest 里**声明**要用哪些系统能力，
// 宿主只放行声明过的；没声明一律拒，并把每次判定写进审计日志。
//
// 为什么需要它：让插件读别的窗口 / 模拟键鼠，属于「能替用户操作系统」的权力。
// 没有声明与审计，出事时既说不清、也拦不住。
//
// 声明位置（profile 里每个包的 package.json）：
//   "dsh": { "windows": { "uia": "read" } }        // 只读
//   "dsh": { "windows": { "uia": "act" } }         // 可操作（风险高，默认拒绝）
//
// 纯函数，方便直接测；CLI 在 tools/windows-gate.mjs。

export const ACTIONS = Object.freeze({
  'uia.read': { capability: 'uia', level: 'read', risk: 'low', note: '读窗口/控件树/文本' },
  'uia.act': { capability: 'uia', level: 'act', risk: 'high', note: '点按钮/输入文本' },
  'input.simulate': { capability: 'input', level: 'act', risk: 'high', note: '模拟键鼠' },
  'fs.watch': { capability: 'fs', level: 'read', risk: 'low', note: '监听文件变化' },
  'proc.enumerate': { capability: 'proc', level: 'read', risk: 'low', note: '列进程/窗口/句柄' },
});

/** 从 package.json 里取声明；缺省 = 什么都没声明（最安全）。 */
export function declared(pkg) {
  const w = pkg && pkg.dsh && pkg.dsh.windows;
  if (!w || typeof w !== 'object') return { uia: 'none', input: 'none', fs: 'none', proc: 'none' };
  const pick = (v) => (v === 'read' || v === 'act' ? v : 'none');
  return { uia: pick(w.uia), input: pick(w.input), fs: pick(w.fs), proc: pick(w.proc) };
}

/**
 * 判定一次调用：
 *   allow  —— 声明等级 >= 需要的等级
 *   deny   —— 没声明 / 等级不够 / 未知动作
 * 返回 reason 一定要能直接展示给用户（这是 hooks 那条纪律的延续）。
 */
export function decide(caps, action) {
  const spec = ACTIONS[action];
  if (!spec) return { allow: false, reason: '未知动作 ' + action };
  const have = (caps && caps[spec.capability]) || 'none';
  if (have === 'none') {
    return { allow: false, reason: '插件没有声明 windows.' + spec.capability + '，宿主拒绝（声明后才可用）' };
  }
  const rank = { none: 0, read: 1, act: 2 };
  if ((rank[have] || 0) < rank[spec.level]) {
    return { allow: false, reason: '插件只声明了 ' + spec.capability + '=' + have + '，这次需要 ' + spec.level + '（' + spec.note + '）' };
  }
  return { allow: true, reason: '已声明 ' + spec.capability + '=' + have + '，允许 ' + action };
}

/** 审计行：一条调用一条，永不改写。 */
export function auditLine({ at, plugin, action, verdict, reason }) {
  return JSON.stringify({ at: at || new Date().toISOString(), plugin: plugin || '', action, verdict, reason }) + '\n';
}

if (typeof window !== 'undefined') {
  window.TurnstileWindowsGate = { ACTIONS, declared, decide, auditLine };
}
