'use strict';
// slots 数据来源（C-13）：公开 snapshot 优先；私有 _core.records 只能算「降级」；
// 两者都没有就是 unavailable——绝不能把私有读取冒充成公开观测。
export const SLOTS_SOURCES = ['public-snapshot', 'private-fallback', 'unavailable'];

export function resolveSlotsSource(slots) {
  if (!slots || typeof slots !== 'object') return { source: 'unavailable', records: null, note: 'ctx.slots 不存在' };
  // 公开形态优先：snapshot()/describe() 给的是稳定契约
  for (const name of ['snapshot', 'describe']) {
    if (typeof slots[name] === 'function') {
      try {
        const value = slots[name]();
        if (value) return { source: 'public-snapshot', records: value, note: 'slots.' + name + '()' };
      } catch (e) { /* 公开入口坏了也不要退回私有装作没事 */ return { source: 'unavailable', records: null, note: 'slots.' + name + '() 抛出：' + String(e && e.message || e).slice(0, 80) }; }
    }
  }
  const core = slots._core && slots._core.records;
  if (core && typeof core.forEach === 'function') {
    return { source: 'private-fallback', records: core, note: '私有 ctx.slots._core.records（降级读取，版本升级可能失效）' };
  }
  return { source: 'unavailable', records: null, note: '既没有公开 snapshot，也没有私有 records' };
}

// 给 UI/上报用的一句话：私有来源不能写成“观测到”
export function sourceLabel(source) {
  if (source === 'public-snapshot') return '公开 snapshot';
  if (source === 'private-fallback') return '私有降级（非公开观测）';
  return '不可用';
}

if (typeof window !== 'undefined') window.TurnstileSlotsSource = { resolveSlotsSource: resolveSlotsSource, sourceLabel: sourceLabel };
