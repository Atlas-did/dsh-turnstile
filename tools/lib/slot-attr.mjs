'use strict';
// slot 归属规则：把「一个 entry id 属于哪个插件」抽成唯一实现。
// 之前 ui-atlas 与 slot-map-report 各写一份，正是本项目批评的「手工漂移」。
//
// 实测到的三种写法（见 docs/130、docs/131）：
//   冒号  dsh-better-sidebar:editor         → 冒号前是插件名
//   路径  @scope/pkg/guide                  → 首段 scope/name
//   点号  turnstile.plugin-list             → 第一段（≥6 字符）
// 核心条目（bash / user / permission）归不上，返回 null —— 不硬塞给插件。

export const CORE = '(核心/未归属)';

/** 从一个 entry id 反推插件名；归不上返回 null。 */
export function pluginOf(entryId) {
  const s = String(entryId || '').trim();
  if (!s) return null;
  const scoped = /^(@[\w.-]+\/[\w.-]+)/.exec(s);
  if (scoped) return scoped[1];
  if (s.includes(':') && !s.startsWith('http')) {
    const head = s.split(':')[0];
    if (head && /^[\w.@/-]+$/.test(head)) return head;
  }
  const dot = s.split('.')[0];
  if (s.includes('.') && dot.length >= 6 && /^[\w-]+$/.test(dot)) return dot;
  return null;
}

/** 某个 entry 是否属于给定插件（用于 --plugin 过滤）。 */
export function belongsTo(entryId, plugin) {
  const s = String(entryId || '');
  const p = String(plugin || '');
  if (!p) return false;
  if (s === p || s.startsWith(p + ':') || s.startsWith(p + '/')) return true;
  const head = p.split('-')[0];
  return head.length >= 6 && s.startsWith(head + '.');
}

/** 按插件聚合：{ plugin → { slot → [entryId] } } */
export function groupByPlugin(slots) {
  const out = new Map();
  for (const s of slots || []) {
    for (const id of s.entries || []) {
      const plugin = pluginOf(id) || CORE;
      if (!out.has(plugin)) out.set(plugin, new Map());
      const m = out.get(plugin);
      if (!m.has(s.slot)) m.set(s.slot, []);
      m.get(s.slot).push(String(id));
    }
  }
  return out;
}

/** 两个快照的 slot 差异：谁多了、谁少了。 */
export function diffSlotMaps(before, after) {
  const index = (map) => {
    const m = new Map();
    for (const s of (map && map.slots) || []) m.set(s.slot, new Set((s.entries || []).map(String)));
    return m;
  };
  const a = index(before);
  const b = index(after);
  const all = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const slot of [...all].sort()) {
    const oldSet = a.get(slot) || new Set();
    const newSet = b.get(slot) || new Set();
    const added = [...newSet].filter((x) => !oldSet.has(x));
    const removed = [...oldSet].filter((x) => !newSet.has(x));
    if (added.length || removed.length) out.push({ slot, added, removed, before: oldSet.size, after: newSet.size });
  }
  return out;
}
