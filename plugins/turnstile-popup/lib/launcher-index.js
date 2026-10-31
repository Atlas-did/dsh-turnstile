'use strict';
// 启动器的检索内核：模糊匹配 + 评分 + 稳定排序。纯函数，方便直接测。
//
// 学 Everything 的不是「读 USN 日志」（那要 P/Invoke），而是它的交互模型：
//   输入任意片段 → 立刻给最可能的几条 → 用键盘选中就打开。
//
// 匹配规则（按优先级）：
//   1. 完整包含（不区分大小写）——分最高；
//   2. 词首缩写（dsh → DeepSeek Harness）——次之；
//   3. 子序列（dshbr → DSH Bridge）——兜底，分数最低。

export function scoreMatch(path, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  const p = String(path || '').toLowerCase();
  const base = p.split(/[\\/]/).pop() || p;
  if (base === q) return 1000;
  if (base.startsWith(q)) return 800 - base.length * 0.1;
  if (base.includes(q)) return 600 - base.length * 0.1;
  if (p.includes(q)) return 400 - p.length * 0.01;
  // 词首缩写：按分隔符取首字母
  const initials = base.split(/[\s._\-]+/).map((w) => w.charAt(0)).join('');
  if (initials && initials.includes(q)) return 300 - base.length * 0.05;
  // 子序列
  let i = 0;
  for (const ch of base) { if (ch === q[i]) i += 1; if (i === q.length) break; }
  if (i === q.length) return 150 - base.length * 0.02;
  return 0;
}

export function searchIndex(entries, query, { limit = 20 } = {}) {
  const scored = [];
  for (const e of entries || []) {
    const s = scoreMatch(e.path || e.name || '', query);
    if (s > 0) scored.push({ ...e, score: Math.round(s) });
  }
  scored.sort((a, b) => b.score - a.score || String(a.path).localeCompare(String(b.path)));
  return scored.slice(0, limit);
}

/** 建索引时该跳过的目录：体积大且几乎不会被搜。 */
export const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'AppData', 'Windows', 'ProgramData', '$Recycle.Bin', 'System Volume Information']);

export function shouldSkip(name) { return SKIP_DIRS.has(name); }

if (typeof window !== 'undefined') window.TurnstileLauncher = { scoreMatch, searchIndex, shouldSkip, SKIP_DIRS };
